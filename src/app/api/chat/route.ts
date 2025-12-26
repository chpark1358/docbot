import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { buildPrompt } from "@/lib/prompt";
import {
  ALL_DOCS_MIME_TYPE,
  CHAT_MODEL,
  EMBEDDING_MODEL,
  VIRTUAL_CHAT_MIME_TYPE,
  WEB_SEARCH_CONTEXT_SIZE,
} from "@/lib/constants";
import type { ChatSource } from "@/lib/database.types";
import { fetchFaqEmbeddings } from "@/lib/zendesk/search";
import {
  ensureAllDocsVirtualDocumentId,
  ensureVirtualChatDocumentId,
  isAllDocsVirtualDocument,
  isVirtualChatDocument,
} from "@/lib/virtual-chat";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "nodejs";

type ChatMode = "document" | "web" | "auto";

type WebSource = { type: "url"; url: string; order: number };

type ThreadMessage = {
  role: "user" | "assistant";
  content: string;
};

const MODERATION_MODEL = "omni-moderation-latest";
const MODERATION_BLOCK_MESSAGE =
  "요청하신 내용은 안전 정책상 도와드릴 수 없습니다. 다른 방식으로 질문해 주세요.";

const DOC_HISTORY_LIMIT = 12;
const WEB_HISTORY_LIMIT = 20;
const RETRIEVAL_QUERY_MAX_CHARS = 800;
const TITLE_MODEL = "gpt-4o-mini";
const MIN_SIMILARITY = 0.35;

const isReferentialQuestion = (question: string) => {
  const trimmed = question.trim();
  if (trimmed.length < 15) return true;
  return /(?:그거|이거|저거|그것|이것|저것|위에서|앞에서|아까|방금|추가로|더 자세히|다시)/.test(trimmed);
};

const isGreetingMessage = (text: string) => {
  const trimmed = text.trim().toLowerCase();
  return /^(안녕|안녕하세요|ㅎㅇ|하이|hello|hi|hey)$/.test(trimmed);
};

const buildRetrievalQuery = (question: string, lastUserMessage: string | null) => {
  const trimmed = question.trim().replace(/\s+/g, " ");
  if (!lastUserMessage) return trimmed;
  if (!isReferentialQuestion(trimmed)) return trimmed;

  const combined = `${lastUserMessage.trim()}\n${trimmed}`;
  return combined.slice(0, RETRIEVAL_QUERY_MAX_CHARS);
};

const fetchThreadHistory = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  userId: string,
  limit: number,
): Promise<ThreadMessage[]> => {
  const { data } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .neq("role", "system")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    .reverse();

  return rows;
};

const moderateText = async (text: string): Promise<boolean> => {
  const res = await openai.moderations.create({
    model: MODERATION_MODEL,
    input: text,
  });

  const flagged = res?.results?.[0]?.flagged;
  return Boolean(flagged);
};

const generateTitle = async (question: string): Promise<string | null> => {
  try {
    const completion = await openai.chat.completions.create({
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
    if (!title) return null;
    return title.replace(/["'`]/g, "").slice(0, 24);
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
    const type = (item as { type?: unknown }).type;
    if (type !== "web_search_call") continue;

    const sources = (item as { action?: { sources?: unknown } }).action?.sources;
    if (!Array.isArray(sources)) continue;

    for (const src of sources) {
      if (typeof src !== "object" || src === null) continue;
      const url = (src as { url?: unknown }).url;
      if (typeof url !== "string" || !url.startsWith("http")) continue;
      urls.push(url);
    }
  }

  const unique = Array.from(new Set(urls));
  return unique.slice(0, 6).map((url, idx) => ({ type: "url", url, order: idx + 1 }));
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY를 설정해주세요." }, { status: 400 });
  }

  const url = new URL(req.url);
  const isStream = url.searchParams.get("stream") === "1" || (req.headers.get("accept") ?? "").includes("text/event-stream");

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
  const modeInput: ChatMode | undefined = body?.mode === "web" || body?.mode === "document" ? body.mode : undefined;

  if (!question?.trim()) {
    return NextResponse.json({ error: "question은 필수입니다." }, { status: 400 });
  }

  let threadId = threadIdInput ?? null;
  let documentId = documentIdInput ?? null;
  const requestedMode: ChatMode = modeInput ?? "auto";
  let threadTitle: string | null = null;

  if (!threadId && requestedMode === "web") {
    documentId = null;
  }

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

    documentId = thread.document_id;
    threadTitle = thread.title ?? null;
  }

  let mode: ChatMode = requestedMode;
  if (mode === "auto") {
    mode = documentId ? "document" : "web";
  }

  if (mode === "web" && !documentId) {
    documentId = await ensureVirtualChatDocumentId(supabase, user.id);
  }

  if (mode === "document" && !documentId) {
    // 모든 문서 대상으로 대화: 준비된 문서가 있는지 확인 후 가상 문서 ID 발급
    const { count: readyCount } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .or(`user_id.eq.${user.id},is_shared.eq.true`)
      .eq("status", "ready")
      .neq("mime_type", VIRTUAL_CHAT_MIME_TYPE)
      .neq("mime_type", ALL_DOCS_MIME_TYPE);

    if (!readyCount || readyCount <= 0) {
      return NextResponse.json({ error: "처리 완료된 문서가 없습니다. 먼저 문서를 업로드하고 처리 완료를 기다려주세요." }, { status: 400 });
    }

    documentId = await ensureAllDocsVirtualDocumentId(supabase, user.id);
  }

  if (!documentId) {
    return NextResponse.json({ error: "documentId가 필요합니다." }, { status: 400 });
  }

  // 문서 소유 여부 확인
  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("id, user_id, title, status, mime_type, is_shared")
    .eq("id", documentId)
    .or(`user_id.eq.${user.id},is_shared.eq.true`)
    .single();

  if (docError || !document) {
    return NextResponse.json({ error: "문서를 찾을 수 없거나 접근 권한이 없습니다." }, { status: 404 });
  }

  const virtualChat = isVirtualChatDocument(document.mime_type);

  const allDocsMode = isAllDocsVirtualDocument(document.mime_type);

  if (!virtualChat && !allDocsMode && document.status !== "ready") {
    return NextResponse.json({ error: "문서 처리 중입니다. 잠시 후 다시 시도해주세요." }, { status: 400 });
  }

  let blocked = false;
  try {
    blocked = await moderateText(question);
  } catch {
    return NextResponse.json({ error: "안전성 검사 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
  }

  const titleCandidate = question.trim().replace(/\s+/g, " ").slice(0, 60);

  // 스레드가 없으면 새로 생성
  if (!threadId) {
    const { data: thread } = await supabase
      .from("chat_threads")
      .insert({
        document_id: document.id,
        user_id: user.id,
        title:
          blocked || !titleCandidate
            ? virtualChat
              ? "새 웹 검색 대화"
              : `${document.title.slice(0, 40)} 대화`
            : titleCandidate,
      })
      .select("id, title")
      .single();

    threadId = thread?.id ?? null;
    threadTitle = thread?.title ?? null;
  }

  if (!threadId) {
    return NextResponse.json({ error: "스레드를 생성할 수 없습니다." }, { status: 500 });
  }

  const historyLimit = virtualChat ? WEB_HISTORY_LIMIT : DOC_HISTORY_LIMIT;
  const history = await fetchThreadHistory(supabase, threadId, user.id, historyLimit);

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

  const defaultDocTitle = `${document.title.slice(0, 40)} 대화`;
  const shouldUpdateTitle =
    !threadTitle || threadTitle.trim() === "" || threadTitle === defaultDocTitle || threadTitle === "새 대화" || threadTitle === "새 웹 검색 대화";

  if (!blocked && shouldUpdateTitle && titleCandidate) {
    await supabase
      .from("chat_threads")
      .update({ title: titleCandidate })
      .eq("id", threadId)
      .eq("user_id", user.id);
  }

  if (blocked) {
    const answer = MODERATION_BLOCK_MESSAGE;
    const sources: ChatSource[] = [];

    const { error: assistantMsgError } = await supabase.from("chat_messages").insert({
      thread_id: threadId,
      user_id: user.id,
      role: "assistant",
      content: answer,
      sources,
    });

    if (assistantMsgError) {
      return NextResponse.json({ error: "답변 저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      threadId,
      answer,
      sources,
    });
  }

  let answer = "답변 생성에 실패했습니다.";
  let sources: ChatSource[] = [];
  let generatedTitle: string | null = null;

  if (virtualChat) {
    const input = [
      ...history,
      {
        role: "user" as const,
        content: question,
      },
    ];

    const instructions =
      "한국어로 답하며, 최신 정보를 위해 웹 검색을 활용한다. 불확실하면 '확실하지 않습니다'라고 말한다. " +
      "항상 가장 최근/공식 릴리스 노트·벤더 문서를 우선 사용하고, 오래된 정보는 배제한다. " +
      "출력 형식: ## 핵심 요약(최신 날짜/버전 명시) → 상세(불릿 3~6개, 굵게 키워드) → 추가 팁/다음 단계(필요 시). " +
      "답변에 출처/번호/링크/URL은 넣지 마라(출처 표시는 UI에서 처리).";

    if (isStream) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          let full = "";
          let finalResponse: unknown = null;
          try {
            const webRes = await openai.responses.create({
              model: CHAT_MODEL,
              instructions,
              input,
              tools: [{ type: "web_search_preview", search_context_size: WEB_SEARCH_CONTEXT_SIZE }],
              tool_choice: "auto",
              include: ["web_search_call.action.sources"],
              temperature: 0.2,
              stream: true,
            });

            // 스트리밍 이벤트 처리
            for await (const event of webRes as AsyncIterable<unknown>) {
              const e = event as { type?: string; delta?: string; error?: { message?: string }; response?: unknown };
              if (e?.type === "response.output_text.delta" && typeof e.delta === "string") {
                full += e.delta;
                send({ type: "chunk", text: e.delta });
              } else if (e?.type === "response.error") {
                throw new Error(e.error?.message || "웹 검색 스트리밍 오류");
              } else if (e?.type === "response.completed") {
                finalResponse = e.response ?? null;
              }
            }

            if (!finalResponse && full) {
              // 일부 SDK에서는 완료 이벤트 없이 text만 반환할 수 있어 대비
              finalResponse = { output: [{ type: "output_text", content: full }] };
            }

            const streamSources = extractWebSources(finalResponse);
            await supabase.from("chat_messages").insert({
              thread_id: threadId,
              user_id: user.id,
              role: "assistant",
              content: full || "검색 결과가 없습니다.",
              sources: streamSources,
            });

            const newTitle = shouldUpdateTitle ? await generateTitle(question) : null;
            if (shouldUpdateTitle && newTitle) {
              await supabase.from("chat_threads").update({ title: newTitle }).eq("id", threadId).eq("user_id", user.id);
            }

            send({ type: "done", answer: full || "검색 결과가 없습니다.", sources: streamSources });
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
    } else {
      const webRes = await openai.responses.create({
        model: CHAT_MODEL,
        instructions,
        input,
        tools: [{ type: "web_search_preview", search_context_size: WEB_SEARCH_CONTEXT_SIZE }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        temperature: 0.2,
      });

      answer = webRes.output_text || "답변을 생성할 수 없습니다.";
      sources = extractWebSources(webRes);
      if (shouldUpdateTitle) {
        generatedTitle = await generateTitle(question);
      }
    }
  } else if (allDocsMode) {
    const lastUserMessage = (() => {
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].role === "user") return history[i].content;
      }
      return null;
    })();

    const retrievalQuery = buildRetrievalQuery(question, lastUserMessage);

    // 질문 임베딩
    const embeddingRes = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: retrievalQuery,
    });

    const queryEmbedding = embeddingRes.data[0].embedding;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matchesRaw, error: matchError } = await (supabase as any).rpc("match_chunks_all_user", {
      query_embedding: queryEmbedding,
      match_count: 6,
      similarity_threshold: 0.2,
    });
    const matches = (matchesRaw ?? []) as { id: string; content: string; similarity: number; doc_title?: string }[];

    if (matchError) {
      const msg =
        typeof matchError.message === "string" && matchError.message.includes("match_chunks_all_user")
          ? "Supabase에 match_chunks_all_user 함수가 없습니다. schema.sql을 적용해 주세요."
          : matchError.message;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const hasRelevant = matches.some((m) => (m.similarity ?? 0) >= MIN_SIMILARITY);
    const greeting = isGreetingMessage(question);

    if (greeting || !hasRelevant) {
      answer = greeting ? "안녕하세요! 궁금한 내용을 말씀해 주세요. 업로드한 문서 기반으로 답변해 드릴게요." : "관련된 문서를 찾지 못했습니다. 더 구체적으로 질문해 주세요.";
      sources = [];
    } else {
      const prompt = buildPrompt(
        question,
        matches.map((m) => ({
          id: m.id,
          content: m.content,
          similarity: m.similarity,
        })),
      );

      if (isStream) {
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            let full = "";
            try {
              const completion = await openai.chat.completions.create({
                model: CHAT_MODEL,
                messages: [{ role: "system", content: prompt.system }, ...history, { role: "user", content: prompt.user }],
                temperature: 0.2,
                stream: true,
              });

              for await (const part of completion) {
                const delta = part.choices[0]?.delta?.content;
                if (delta) {
                  full += delta;
                  send({ type: "chunk", text: delta });
                }
              }

              const streamSources = matches.map((m, idx) => ({
                id: m.id,
                snippet: m.content.slice(0, 200),
                similarity: m.similarity,
                order: idx + 1,
                doc_title: m.doc_title ?? "문서",
              })) as ChatSource[];

              await supabase.from("chat_messages").insert({
                thread_id: threadId,
                user_id: user.id,
                role: "assistant",
                content: full || "문서에서 확인되지 않음",
                sources: streamSources,
              });

              const newTitle = shouldUpdateTitle ? await generateTitle(question) : null;
              if (shouldUpdateTitle && newTitle) {
                await supabase.from("chat_threads").update({ title: newTitle }).eq("id", threadId).eq("user_id", user.id);
              }

              send({ type: "done", answer: full, sources: streamSources });
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
      } else {
        const completion = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages: [{ role: "system", content: prompt.system }, ...history, { role: "user", content: prompt.user }],
          temperature: 0.2,
        });

        answer = completion.choices[0]?.message?.content ?? "문서에서 확인되지 않음";
        sources = matches.map((m, idx) => ({
          id: m.id,
          snippet: m.content.slice(0, 200),
          similarity: m.similarity,
          order: idx + 1,
          doc_title: m.doc_title ?? "문서",
        }));
        if (shouldUpdateTitle) {
          generatedTitle = await generateTitle(question);
        }
      }
    }
  } else {
    const lastUserMessage = (() => {
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].role === "user") return history[i].content;
      }
      return null;
    })();

    const retrievalQuery = buildRetrievalQuery(question, lastUserMessage);

    // 질문 임베딩
    const embeddingRes = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: retrievalQuery,
    });

    const queryEmbedding = embeddingRes.data[0].embedding;

    // 컨텍스트 검색
    const { data: matches, error: matchError } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      doc_id: document.id,
      match_count: 6,
      similarity_threshold: 0.2,
    });

    if (matchError) {
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }

    // FAQ 임베딩 조회 및 스코어링
    let faqSources: ChatSource[] = [];
    try {
      const faqs = await fetchFaqEmbeddings(8);
      if (faqs?.length) {
        const dot = (a: number[], b: number[]) => a.reduce((acc, v, i) => acc + v * b[i], 0);
        const scored = faqs
          .filter((f) => Array.isArray(f.embedding))
          .map((f) => ({
            ...f,
            score: dot(f.embedding as number[], queryEmbedding),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 4);
        faqSources = scored.map((f, idx) => ({
          type: "chunk",
          id: `faq-${f.faq_id ?? f.id}`,
          order: idx + 1,
          content: f.content ?? "",
          metadata: f.metadata ?? { source: "zendesk_faq" },
          similarity: f.score,
        }));
      }
    } catch {
      // FAQ 임베딩 조회 실패 시 무시
    }

    const prompt = buildPrompt(
      question,
      [
        ...faqSources.map((s) => ({
          id: (s as any).id ?? "",
          content: (s as any).content ?? "",
          similarity: (s as any).similarity ?? 0,
        })),
        ...(matches ?? []).map((m) => ({
          id: m.id,
          content: m.content,
          similarity: m.similarity,
        })),
      ],
    );

    const hasRelevant =
      faqSources.some((s) => (s as any).similarity >= MIN_SIMILARITY) ||
      (matches ?? []).some((m) => (m.similarity ?? 0) >= MIN_SIMILARITY);
    const greeting = isGreetingMessage(question);

    if (greeting || !hasRelevant) {
      answer = greeting ? "안녕하세요! 궁금한 내용을 말씀해 주세요. 업로드한 문서 기반으로 답변해 드릴게요." : "관련된 문서를 찾지 못했습니다. 더 구체적으로 질문해 주세요.";
      sources = [];
    } else if (isStream) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          let full = "";
          try {
            const completion = await openai.chat.completions.create({
              model: CHAT_MODEL,
              messages: [{ role: "system", content: prompt.system }, ...history, { role: "user", content: prompt.user }],
              temperature: 0.2,
              stream: true,
            });

            for await (const part of completion) {
              const delta = part.choices[0]?.delta?.content;
              if (delta) {
                full += delta;
                send({ type: "chunk", text: delta });
              }
            }

            const streamSources =
              matches?.map((m, idx) => ({
                id: m.id,
                snippet: m.content.slice(0, 200),
                similarity: m.similarity,
                order: idx + 1,
                doc_title: document.title,
              })) ?? [];

            await supabase.from("chat_messages").insert({
              thread_id: threadId,
              user_id: user.id,
              role: "assistant",
              content: full || "문서에서 확인되지 않음",
              sources: streamSources,
            });

            const newTitle = shouldUpdateTitle ? await generateTitle(question) : null;
            if (shouldUpdateTitle && newTitle) {
              await supabase.from("chat_threads").update({ title: newTitle }).eq("id", threadId).eq("user_id", user.id);
            }

            send({ type: "done", answer: full, sources: streamSources });
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
    } else {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [{ role: "system", content: prompt.system }, ...history, { role: "user", content: prompt.user }],
        temperature: 0.2,
      });

      answer = completion.choices[0]?.message?.content ?? "문서에서 확인되지 않음";
      sources = (matches ?? []).map((m, idx) => ({
        id: m.id,
        snippet: m.content.slice(0, 200),
        similarity: m.similarity,
        order: idx + 1,
        doc_title: document.title,
      }));
      if (shouldUpdateTitle) {
        generatedTitle = await generateTitle(question);
      }
    }
  }

  const { error: assistantMsgError } = await supabase.from("chat_messages").insert({
    thread_id: threadId,
    user_id: user.id,
    role: "assistant",
    content: answer,
    sources,
  });

  if (assistantMsgError) {
    return NextResponse.json({ error: "답변 저장에 실패했습니다." }, { status: 500 });
  }

  if (shouldUpdateTitle && generatedTitle) {
    await supabase.from("chat_threads").update({ title: generatedTitle }).eq("id", threadId).eq("user_id", user.id);
  }

  return NextResponse.json({
    threadId,
    answer,
    sources,
  });
}
