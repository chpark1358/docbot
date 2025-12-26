import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, STORAGE_BUCKET } from "@/lib/constants";
import { processDocument } from "@/lib/process-document";

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

  const body = await req.json().catch(() => null) as { storagePath?: string; fileName?: string; mimeType?: string; size?: number } | null;
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
  const fileName = typeof body?.fileName === "string" ? body.fileName : "";
  const size = typeof body?.size === "number" ? body.size : 0;
  const mimeTypeInput = typeof body?.mimeType === "string" ? body.mimeType : "";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const extMime =
    ext === "pdf"
      ? "application/pdf"
      : ext === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === "doc"
          ? "application/msword"
          : ext === "txt"
            ? "text/plain"
            : "";
  const mimeType = mimeTypeInput || extMime || "application/octet-stream";

  if (!storagePath || !storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "유효하지 않은 경로입니다." }, { status: 400 });
  }

  if (!fileName || size <= 0) {
    return NextResponse.json({ error: "파일 정보가 올바르지 않습니다." }, { status: 400 });
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `파일 크기가 너무 큽니다. 최대 ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB까지 업로드할 수 있습니다.` },
      { status: 400 },
    );
  }

  const allowedExt = ["pdf", "doc", "docx", "txt"].includes(ext);
  const allowed = allowedExt || ALLOWED_MIME_TYPES.some((type) => mimeType === type || mimeType.startsWith(type.split("/")[0]));
  if (!allowed) {
    return NextResponse.json({ error: "지원하지 않는 파일 형식입니다. pdf, docx, txt만 업로드 가능합니다." }, { status: 400 });
  }

  const service = createServiceClient();

  const inserted = await service
    .from("documents")
    .insert({
      title: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      size,
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

  try {
    await processDocument(service, inserted.data.id);
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
