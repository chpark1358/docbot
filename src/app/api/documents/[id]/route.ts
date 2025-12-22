import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  const resolved = await Promise.resolve(params);
  const documentId = resolved.id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, user_id, storage_path, title")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "문서를 찾을 수 없거나 접근 권한이 없습니다." }, { status: 404 });
  }

  const { data: signed } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(doc.storage_path, 60 * 5, { download: doc.title });

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "다운로드 URL을 생성할 수 없습니다." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}

export async function DELETE(_: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  const resolved = await Promise.resolve(params);
  const documentId = resolved.id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, user_id, storage_path")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "문서를 찾을 수 없거나 접근 권한이 없습니다." }, { status: 404 });
  }

  // 스토리지 삭제
  const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
  if (storageError) {
    return NextResponse.json({ error: `파일 삭제 실패: ${storageError.message}` }, { status: 500 });
  }

  // documents 삭제 (cascade로 chunks/threads/messages 삭제)
  const { error: deleteError } = await supabase.from("documents").delete().eq("id", documentId).eq("user_id", user.id);
  if (deleteError) {
    return NextResponse.json({ error: `문서 삭제 실패: ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
