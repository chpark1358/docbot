import { NextResponse } from "next/server";
import mime from "mime";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, STORAGE_BUCKET } from "@/lib/constants";
import { processDocument } from "@/lib/process-document";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 늘어난 업로드 허용량(기본 4.5MB 한계를 넘기기 위함)
// Vercel Node 함수 기준으로 적용됨
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "40mb",
    },
  },
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `파일 크기가 너무 큽니다. 최대 ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB까지 업로드할 수 있습니다.` },
      { status: 400 },
    );
  }

  const mimeType = file.type || mime.getType(file.name) || "application/octet-stream";
  const allowed = ALLOWED_MIME_TYPES.some((type) => mimeType === type);

  if (!allowed) {
    return NextResponse.json({ error: "지원하지 않는 파일 형식입니다. pdf, docx, txt만 업로드 가능합니다." }, { status: 400 });
  }

  // Supabase Storage는 object key에 공백/한글 등 일부 문자를 허용하지 않을 수 있어
  // 파일명을 그대로 쓰지 않고 안전한 키(랜덤 + 확장자)로 저장합니다.
  const ext = file.name.split(".").pop()?.toLowerCase();
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
  const objectPath = `${user.id}/${crypto.randomUUID()}.${safeExt}`;
  const upload = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, file, {
    contentType: mimeType,
    upsert: false,
  });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 400 });
  }

  const inserted = await supabase
    .from("documents")
    .insert({
      title: file.name,
      storage_path: objectPath,
      mime_type: mimeType,
      size: file.size,
      status: "queued",
      user_id: user.id,
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data?.id) {
    return NextResponse.json(
      { error: inserted.error?.message ?? "문서 레코드 생성에 실패했습니다." },
      { status: 400 },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      documentId: inserted.data.id,
      status: "queued",
      message: "업로드 완료 (처리를 위해 OPENAI_API_KEY 설정 필요)",
    });
  }

  try {
    await processDocument(supabase, inserted.data.id);
    return NextResponse.json({
      documentId: inserted.data.id,
      status: "ready",
      message: "업로드 및 처리 완료",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 처리 중 오류가 발생했습니다.";
    return NextResponse.json(
      {
        documentId: inserted.data.id,
        status: "failed",
        error: message,
      },
      { status: 500 },
    );
  }
}
