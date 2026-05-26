import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPrompt } from "@/lib/prompt";
import {
  CHAT_MODEL,
  EMBEDDING_MODEL,
  WEB_SEARCH_CONTEXT_SIZE,
} from "@/lib/constants";
import { ensureAllDocsVirtualDocumentId, isVirtualDocumentMime } from "@/lib/virtual-chat";
import { getOpenAI } from "@/lib/openai";
import type { ChatSource } from "@/lib/database.types";

export const runtime = "nodejs";

type ThreadMessage = { role: "user" | "assistant"; content: string };
type ChunkMatch = { id: string; content: string; similarity: number; doc_title?: string };
type WebSource = { type: "url"; url: string; order: number };

const MODERATION_MODEL = "omni-moderation-latest";
const MODERATION_BLOCK_MESSAGE =
  "요청하신 내용은 안전 정책상 도와드릴 수 없습니다. 다른 방식으로 질문해 주세요.";
const TITLE_MODEL = "gpt-4o-mini";
const HISTORY_LIMIT = 16;
const MIN_SIMILARITY = 0.35;
const RAG_TOP_K = 8;
const RETRIEVAL_QUERY_MAX_CHARS = 800;

const DEFAULT_TITLES = new Set(["새 대화", "새 웹 검색 대화", "내 문서 전체 대화"]);

const isReferentialQuestion = (text: string) => {
  const t = text.trim();
  if (t.length < 15) return true;
  return /(?:그거|이거|저거|그것|이것|저것|위에서|앞에서|아까|방금|추가로|더 자세히|다시)/.test(t);
};

const isGreetingMessage = (text: string) =>
  /^(안녕|안녕하세요|ㅎㅇ|하이|hello|hi|hey)$/.test(text.trim().toLowerCase());

const buildRetrievalQuery = (question: string, lastUserMessage: string | null) => {
  const trimmed = question.trim().replace(/\s+/g, " ");
  if (!lastUserMessage || !isReferentialQuestion(trimmed)) return trimmed;
  return `${lastUserMessage.trim()}\n${trimmed}`.slice(0, RETRIEVAL_QUERY_MAX_CHARS);
};

const fetchThreadHistory = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  userId: string,
): Promise<ThreadMessage[]> => {
  const { data } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .neq("role", "system")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  return (data ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    .reverse();
};

const moderateText = async (text: string): Promise<boolean> => {
  const res = await getOpenAI().moderations.create({ model: MODERATION_MODEL, input: text });
  return Boolean(res?.results?.[0]?.flagged);
};

const generateTitle = async (question: string): Promise<string | null> => {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: TITLE_MODEL,
      messages: [
        {
          role: "system",
          content:
            "다음 한국어 질문을 12자 이내의 짧은 제목으로 요약하세요. 마침표/따옴표/이모지는 넣지 말고, 핵심 키워드만 남기세요.",
        },
        { role: "user", content: question },
      ],
      max_tokens: 30,
      temperature: 0.3,
    });
    const title = completion.choices[0]?.message?.content?.trim();
    return title ? title.replace(/["'`]/g, "").slice(0, 24) : null;
  } catch {
    return null;
  }
};

const extractWebSources = (response: unknown): WebSource[] => {
  const urls: string[] = [];
  if (typeof response !== "object" || response === null) return [];
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return [];

  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    if ((item as { type?: unknown }).type !== "web_search_call") continue;
    const sources = (item as { action?: { sources?: unknown } }).action?.sources;
    if (!Array.isArray(sources)) continue;
    for (const src of sources) {
      const url = (src as { url?: unknown }).url;
      if (typeof url === "string" && url.startsWith("http")) urls.push(url);
    }
  }
  return Array.from(new Set(urls))
    .slice(0, 6)
    .map((url, idx) => ({ type: "url" as const, url, order: idx + 1 }));
};

const searchDocuments = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
  scopedDocumentId: string | null,
): Promise<ChunkMatch[]> => {
  const embeddingRes = await getOpenAI().embeddings.create({ model: EMBEDDING_MODEL, input: query });
  const queryEmbedding = embeddingRes.data[0].embedding;

  if (scopedDocumentId) {
    const { data } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      doc_id: scopedDocumentId,
      match_count: RAG_TOP_K,
      similarity_threshold: 0.2,
    });
    return (data ?? []) as ChunkMatch[];
  }

  const { data } = await supabase.rpc("match_chunks_all_user", {
    query_embedding: queryEmbedding,
    match_count: RAG_TOP_K,
    similarity_threshold: 0.2,
  });
  return (data ?? []) as ChunkMatch[];
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY를 설정해주세요." }, { status: 400 });
  }

  const url = new URL(req.url);
  const isStream =
    url.searchParams.get("stream") === "1" ||
    (req.headers.get("accept") ?? "").includes("text/event-stream");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const question: string | undefined = typeof body?.question === "string" ? body.question : undefined;
  const documentIdInput: string | undefined = typeof body?.documentId === "string" ? body.documentId : undefined;
  const threadIdInput: string | undefined = typeof body?.threadId === "string" ? body.threadId : undefined;

  if (!question?.trim()) {
    return NextResponse.json({ error: "question은 필수입니다." }, { status: 400 });
  }

  let threadId = threadIdInput ?? null;
  let threadDocumentId: string | null = null;
  let threadTitle: string | null = null;

  if (threadId) {
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("id, document_id, user_id, title")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();
    if (!thread) {
      return NextResponse.json({ error: "스레드를 찾을 수 없거나 접근 권한이 없습니다." }, { status: 404 });
    }
    threadDocumentId = thread.document_id;
    threadTitle = thread.title ?? null;
  }

  // RAG scope 결정: 명시적 documentId 우선, 그다음 thread의 document_id (가상이면 전체로 자동 확장)
  let scopedDocumentId: string | null = null;
  let scopedDocumentTitle = "문서";
  const targetDocumentId = documentIdInput ?? threadDocumentId ?? null;

  if (targetDocumentId) {
    const { data: doc } = await supabase
      .from("documents")
      .select("id, status, mime_type, title")
      .eq("id", targetDocumentId)
      .or(`user_id.eq.${user.id},is_shared.eq.true`)
      .single();
    if (doc && !isVirtualDocumentMime(doc.mime_type)) {
      if (doc.status !== "ready") {
        return NextResponse.json({ error: "문서 처리 중입니다. 잠시 후 다시 시도해주세요." }, { status: 400 });
      }
      scopedDocumentId = doc.id;
      scopedDocumentTitle = doc.title;
    }
  }

  // 모더이션
  let blocked = false;
  try {
    blocked = await moderateText(question);
  } catch {
    return NextResponse.json({ error: "안전성 검사 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
  }

  // 스레드가 없으면 생성 (workspace 가상 문서 사용)
  const titleCandidate = question.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!threadId) {
    const workspaceDocId = scopedDocumentId ?? (await ensureAllDocsVirtualDocumentId(supabase, user.id));
    const { data: thread } = await supabase
      .from("chat_threads")
      .insert({
        document_id: workspaceDocId,
        user_id: user.id,
        title: blocked || !titleCandidate ? "새 대화" : titleCandidate,
      })
      .select("id, title")
      .single();
    threadId = thread?.id ?? null;
    threadTitle = thread?.title ?? null;
  }

  if (!threadId) {
    return NextResponse.json({ error: "스레드를 생성할 수 없습니다." }, { status: 500 });
  }

  const history = await fetchThreadHistory(supabase, threadId, user.id);

  // 사용자 메시지 저장
  const { error: userMsgError } = await supabase.from("chat_messages").insert({
    thread_id: threadId,
    user_id: user.id,
    role: "user",
    content: question,
    sources: [],
  });
  if (userMsgError) {
    return NextResponse.json({ error: "메시지 저장에 실패했습니다." }, { status: 500 });
  }

  const shouldUpdateTitle =
    !threadTitle || threadTitle.trim() === "" || DEFAULT_TITLES.has(threadTitle);
  if (!blocked && shouldUpdateTitle && titleCandidate) {
    await supabase.from("chat_threads").update({ title: titleCandidate }).eq("id", threadId).eq("user_id", user.id);
  }

  // 모더이션 차단 응답
  if (blocked) {
    await supabase.from("chat_messages").insert({
      thread_id: threadId, user_id: user.id, role: "assistant", content: MODERATION_BLOCK_MESSAGE, sources: [],
    });
    return NextResponse.json({ threadId, answer: MODERATION_BLOCK_MESSAGE, sources: [] });
  }

  // 인사 즉답
  if (isGreetingMessage(question)) {
    const greet =
      "안녕하세요! 궁금한 내용을 자유롭게 물어보세요. 사내 문서와 웹을 함께 활용해 답변해 드립니다.";
    await supabase.from("chat_messages").insert({
      thread_id: threadId, user_id: user.id, role: "assistant", content: greet, sources: [],
    });
    return NextResponse.json({ threadId, answer: greet, sources: [] });
  }

  // RAG 검색
  const lastUserMessage = (() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].role === "user") return history[i].content;
    }
    return null;
  })();
  const retrievalQuery = buildRetrievalQuery(question, lastUserMessage);

  let matches: ChunkMatch[] = [];
  try {
    matches = await searchDocuments(supabase, retrievalQuery, scopedDocumentId);
  } catch {
    matches = [];
  }
  const relevantMatches = matches.filter((m) => (m.similarity ?? 0) >= MIN_SIMILARITY);

  // 시스템 + 사용자 프롬프트 빌드
  const prompt = buildPrompt(
    question,
    relevantMatches.map((m) => ({ id: m.id, content: m.content, similarity: m.similarity })),
  );

  const buildDocSources = (): ChatSource[] =>
    relevantMatches.map((m, idx) => ({
      id: m.id,
      snippet: m.content.slice(0, 200),
      similarity: m.similarity,
      order: idx + 1,
      doc_title: m.doc_title ?? scopedDocumentTitle,
    })) as ChatSource[];

  const input = [
    ...history,
    { role: "user" as const, content: prompt.user },
  ];

  const tools = [
    { type: "web_search_preview" as const, search_context_size: WEB_SEARCH_CONTEXT_SIZE },
  ];

  // 스트리밍
  if (isStream) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (payload: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        let full = "";
        let finalResponse: unknown = null;
        try {
          send({ type: "context", docCount: relevantMatches.length });

          const r = await getOpenAI().responses.create({
            model: CHAT_MODEL,
            instructions: prompt.system,
            input,
            tools,
            tool_choice: "auto",
            include: ["web_search_call.action.sources"],
            temperature: 0.2,
            stream: true,
          });

          for await (const event of r as AsyncIterable<unknown>) {
            const e = event as {
              type?: string;
              delta?: string;
              response?: unknown;
              error?: { message?: string };
            };
            if (e.type === "response.output_text.delta" && typeof e.delta === "string") {
              full += e.delta;
              send({ type: "chunk", text: e.delta });
            } else if (e.type === "response.web_search_call.in_progress") {
              send({ type: "tool", tool: "web_search", status: "running" });
            } else if (e.type === "response.web_search_call.completed") {
              send({ type: "tool", tool: "web_search", status: "completed" });
            } else if (e.type === "response.completed") {
              finalResponse = e.response ?? null;
            } else if (e.type === "response.error") {
              throw new Error(e.error?.message ?? "스트리밍 오류");
            }
          }

          const webSources = extractWebSources(finalResponse);
          const docSources = buildDocSources();
          const allSources = [...docSources, ...webSources] as ChatSource[];

          await supabase.from("chat_messages").insert({
            thread_id: threadId,
            user_id: user.id,
            role: "assistant",
            content: full || "답변을 생성하지 못했습니다.",
            sources: allSources,
          });

          if (shouldUpdateTitle) {
            const newTitle = await generateTitle(question);
            if (newTitle) {
              await supabase.from("chat_threads").update({ title: newTitle }).eq("id", threadId).eq("user_id", user.id);
            }
          }

          send({ type: "done", answer: full, sources: allSources });
        } catch (err) {
          send({ type: "error", message: err instanceof Error ? err.message : "스트리밍 오류" });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // 논스트리밍
  const r = await getOpenAI().responses.create({
    model: CHAT_MODEL,
    instructions: prompt.system,
    input,
    tools,
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    temperature: 0.2,
  });

  const answer = r.output_text || "답변을 생성하지 못했습니다.";
  const webSources = extractWebSources(r);
  const docSources = buildDocSources();
  const allSources = [...docSources, ...webSources] as ChatSource[];

  await supabase.from("chat_messages").insert({
    thread_id: threadId,
    user_id: user.id,
    role: "assistant",
    content: answer,
    sources: allSources,
  });

  if (shouldUpdateTitle) {
    const newTitle = await generateTitle(question);
    if (newTitle) {
      await supabase.from("chat_threads").update({ title: newTitle }).eq("id", threadId).eq("user_id", user.id);
    }
  }

  return NextResponse.json({ threadId, answer, sources: allSources });
}
