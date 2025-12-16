"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import mime from "mime";
import { createClient } from "@/lib/supabase/server";
import { STORAGE_BUCKET, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { processDocument } from "@/lib/process-document";

type ActionState = {
  error?: string;
  success?: string;
};

export async function uploadDocument(_: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("file") as File | null;

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  if (!file) {
    return { error: "파일을 선택해주세요." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: `파일 크기가 너무 큽니다. 최대 ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB까지 업로드할 수 있습니다.` };
  }

  const mimeType = file.type || mime.getType(file.name) || "application/octet-stream";
  const allowed = ALLOWED_MIME_TYPES.some((type) => mimeType === type);
  if (!allowed) {
    return { error: "지원하지 않는 파일 형식입니다. pdf, docx, txt만 업로드 가능합니다." };
  }

  const userId = session.user.id;
  const objectPath = `${userId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, file, { contentType: mimeType, upsert: false });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data: inserted, error: docError } = await supabase
    .from("documents")
    .insert({
      title: file.name,
      storage_path: objectPath,
      mime_type: mimeType,
      size: file.size,
      status: "queued",
      user_id: userId,
    })
    .select("id")
    .single();

  if (docError || !inserted) {
    return { error: docError?.message ?? "문서 레코드 생성에 실패했습니다." };
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return { error: "OPENAI_API_KEY를 설정해주세요." };
    }

    await processDocument(supabase, inserted.id);
    revalidatePath("/app");
    return { success: "업로드 및 처리 완료" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 처리 중 오류가 발생했습니다.";
    revalidatePath("/app");
    return { error: message };
  }
}
