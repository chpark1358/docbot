import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("chat_threads").delete().eq("id", threadId).eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
