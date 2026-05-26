import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAllDocsVirtualDocumentId } from "@/lib/virtual-chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const titleInput: string | undefined = typeof body?.title === "string" ? body.title : undefined;

  const workspaceDocId = await ensureAllDocsVirtualDocumentId(supabase, user.id);

  const rawTitle = (titleInput ?? "").trim().replace(/\s+/g, " ");
  const title = rawTitle ? rawTitle.slice(0, 60) : "새 대화";

  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .insert({ document_id: workspaceDocId, user_id: user.id, title })
    .select("id")
    .single();

  if (threadError || !thread?.id) {
    return NextResponse.json({ error: threadError?.message ?? "스레드를 생성할 수 없습니다." }, { status: 500 });
  }

  return NextResponse.json({ threadId: thread.id });
}
