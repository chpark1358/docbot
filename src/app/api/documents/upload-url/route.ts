import { NextResponse } from "next/server";
import mime from "mime";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, STORAGE_BUCKET } from "@/lib/constants";

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

  const body = await req.json().catch(() => null) as { fileName?: string; fileSize?: number; mimeType?: string } | null;
  const fileName = typeof body?.fileName === "string" ? body.fileName : "";
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;
  const mimeTypeInput = typeof body?.mimeType === "string" ? body.mimeType : "";
  const mimeType = mimeTypeInput || mime.getType(fileName) || "application/octet-stream";

  if (!fileName || !fileSize) {
    return NextResponse.json({ error: "파일명과 크기가 필요합니다." }, { status: 400 });
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `파일 크기가 너무 큽니다. 최대 ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB까지 업로드할 수 있습니다.` },
      { status: 400 },
    );
  }

  const allowed = ALLOWED_MIME_TYPES.some((type) => mimeType === type || mimeType.startsWith(type));
  if (!allowed) {
    return NextResponse.json({ error: "지원하지 않는 파일 형식입니다. pdf, docx, txt만 업로드 가능합니다." }, { status: 400 });
  }

  const ext = fileName.split(".").pop()?.toLowerCase();
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
  const objectPath = `${user.id}/${crypto.randomUUID()}.${safeExt}`;

  const service = createServiceClient();
  const { data: signed, error } = await service.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "업로드 URL 생성에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    uploadUrl: signed.signedUrl,
    path: signed.path,
    expiresIn: 600,
    mimeType,
  });
}
