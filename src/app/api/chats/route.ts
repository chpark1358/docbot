import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAllDocsVirtualDocumentId, ensureVirtualChatDocumentId } from "@/lib/virtual-chat";
import { ALL_DOCS_MIME_TYPE, VIRTUAL_CHAT_MIME_TYPE } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Mode = "document" | "web";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const mode: Mode = body?.mode === "web" ? "web" : "document";
  const titleInput: string | undefined = typeof body?.title === "string" ? body.title : undefined;

  if (mode === "web") {
    const resolvedDocumentId = await ensureVirtualChatDocumentId(supabase, user.id);
    const rawTitle = (titleInput ?? "").trim().replace(/\s+/g, " ");
    const title = rawTitle ? rawTitle.slice(0, 60) : "새 웹 검색 대화";

    const { data: thread, error: threadError } = await supabase
      .from("chat_threads")
      .insert({ document_id: resolvedDocumentId, user_id: user.id, title })
      .select("id")
      .single();

    if (threadError || !thread?.id) {
      return NextResponse.json({ error: threadError?.message ?? "스레드를 생성할 수 없습니다." }, { status: 500 });
    }

    return NextResponse.json({ threadId: thread.id });
  }

  // 문서 모드: 업로드된 모든 문서(ready) 대상으로 검색
  const { count: readyCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "ready")
    .neq("mime_type", VIRTUAL_CHAT_MIME_TYPE)
    .neq("mime_type", ALL_DOCS_MIME_TYPE);

  if (!readyCount || readyCount <= 0) {
    return NextResponse.json({ error: "처리 완료된 문서가 없습니다. 먼저 문서를 업로드하고 처리 완료를 기다려주세요." }, { status: 400 });
  }

  const resolvedDocumentId = await ensureAllDocsVirtualDocumentId(supabase, user.id);

  const rawTitle = (titleInput ?? "").trim().replace(/\s+/g, " ");
  const title = rawTitle ? rawTitle.slice(0, 60) : "내 문서 전체 대화";

  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .insert({ document_id: resolvedDocumentId, user_id: user.id, title })
    .select("id")
    .single();

  if (threadError || !thread?.id) {
    return NextResponse.json({ error: threadError?.message ?? "스레드를 생성할 수 없습니다." }, { status: 500 });
  }

  return NextResponse.json({ threadId: thread.id });
}
