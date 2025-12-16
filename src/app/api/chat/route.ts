import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { buildPrompt } from "@/lib/prompt";
import { EMBEDDING_MODEL } from "@/lib/constants";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY를 설정해주세요." }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const question: string | undefined = body?.question;
  const documentId: string | undefined = body?.documentId;
  const threadIdInput: string | undefined = body?.threadId;

  if (!question || !documentId) {
    return NextResponse.json({ error: "question, documentId는 필수입니다." }, { status: 400 });
  }

  // 문서 소유 여부 확인
  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("id, user_id, title, status")
    .eq("id", documentId)
    .single();

  if (docError || !document || document.user_id !== session.user.id) {
    return NextResponse.json({ error: "문서를 찾을 수 없거나 접근 권한이 없습니다." }, { status: 404 });
  }

  if (document.status !== "ready") {
    return NextResponse.json({ error: "문서 처리 중입니다. 잠시 후 다시 시도해주세요." }, { status: 400 });
  }

  // 스레드 결정(없으면 새로 생성)
  let threadId = threadIdInput;
  if (!threadId) {
    const { data: thread } = await supabase
      .from("chat_threads")
      .insert({
        document_id: document.id,
        user_id: session.user.id,
        title: `${document.title.slice(0, 40)} 대화`,
      })
      .select("id")
      .single();

    threadId = thread?.id;
  }

  if (!threadId) {
    return NextResponse.json({ error: "스레드를 생성할 수 없습니다." }, { status: 500 });
  }

  // 사용자 메시지 저장
  const { error: userMsgError } = await supabase.from("chat_messages").insert({
    thread_id: threadId,
    user_id: session.user.id,
    role: "user",
    content: question,
    sources: [],
  });

  if (userMsgError) {
    return NextResponse.json({ error: "메시지 저장에 실패했습니다." }, { status: 500 });
  }

  // 질문 임베딩
  const embeddingRes = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: question,
  });

  const queryEmbedding = embeddingRes.data[0].embedding;

  // 컨텍스트 검색
  type MatchRow = { id: string; content: string; similarity: number; metadata?: unknown };

  const { data: matches, error: matchError } = await supabase.rpc<MatchRow>("match_chunks", {
    query_embedding: queryEmbedding,
    doc_id: document.id,
    match_count: 6,
    similarity_threshold: 0.2,
  });

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  const prompt = buildPrompt(
    question,
    (matches ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      similarity: m.similarity,
    })),
  );

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.2,
  });

  const answer = completion.choices[0]?.message?.content ?? "문서에서 확인되지 않음";

  const { error: assistantMsgError } = await supabase.from("chat_messages").insert({
    thread_id: threadId,
    user_id: session.user.id,
    role: "assistant",
    content: answer,
    sources: (matches ?? []).map((m, idx) => ({
      id: m.id,
      snippet: m.content.slice(0, 200),
      similarity: m.similarity,
      order: idx + 1,
    })),
  });

  if (assistantMsgError) {
    return NextResponse.json({ error: "답변 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    threadId,
    answer,
    sources: (matches ?? []).map((m, idx) => ({
      id: m.id,
      similarity: m.similarity,
      order: idx + 1,
    })),
  });
}
