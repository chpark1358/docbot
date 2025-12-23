import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function deleteThread(threadId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("chat_threads").delete().eq("id", threadId).eq("user_id", userId);
  if (error) {
    throw new Error("삭제에 실패했습니다.");
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: threadId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!threadId) {
    return NextResponse.json({ error: "threadId가 필요합니다." }, { status: 400 });
  }

  try {
    return await deleteThread(threadId, user.id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "삭제에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const formData = await request.formData().catch(() => null);
  const methodOverride = formData?.get("_method")?.toString()?.toUpperCase();
  if (methodOverride !== "DELETE") {
    return NextResponse.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  }

  const { id: threadId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!threadId) {
    return NextResponse.json({ error: "threadId가 필요합니다." }, { status: 400 });
  }

  try {
    return await deleteThread(threadId, user.id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "삭제에 실패했습니다." }, { status: 500 });
  }
}
