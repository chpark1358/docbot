import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText } from "@/lib/chunk";
import { ALLOWED_MIME_TYPES, STORAGE_BUCKET } from "@/lib/constants";
import { embedChunks } from "@/lib/embeddings";
import { parseBufferToText } from "@/lib/parse";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;

const CHUNK_INSERT_BATCH_SIZE = 50;

const markFailed = async (supabase: Supabase, documentId: string, message: string) => {
  await supabase
    .from("documents")
    .update({
      status: "failed",
      error_message: message.slice(0, 400),
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
};

export const processDocument = async (
  supabase: Supabase,
  documentId: string,
): Promise<void> => {
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    throw new Error(docError?.message ?? "문서를 찾을 수 없습니다.");
  }

  if (!ALLOWED_MIME_TYPES.some((type) => doc.mime_type.includes(type.split("/")[1]) || doc.mime_type === type)) {
    await markFailed(supabase, documentId, `지원하지 않는 MIME 타입: ${doc.mime_type}`);
    return;
  }

  await supabase
    .from("documents")
    .update({ status: "processing", updated_at: new Date().toISOString(), error_message: null })
    .eq("id", documentId);

  try {
    const download = await supabase.storage.from(STORAGE_BUCKET).download(doc.storage_path);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "파일 다운로드 실패");
    }

    const buffer = Buffer.from(await download.data.arrayBuffer());
    const text = await parseBufferToText(buffer, doc.mime_type);
    const chunks = chunkText(text);

    if (!chunks.length) {
      throw new Error("본문을 추출할 수 없습니다.");
    }

    const embeddings = await embedChunks(chunks);

    const rows = chunks.map((content, idx) => ({
      document_id: doc.id,
      user_id: doc.user_id,
      content,
      embedding: embeddings[idx],
      metadata: {},
    }));

    for (let start = 0; start < rows.length; start += CHUNK_INSERT_BATCH_SIZE) {
      const batch = rows.slice(start, start + CHUNK_INSERT_BATCH_SIZE);
      const insert = await supabase.from("document_chunks").insert(batch);
      if (insert.error) {
        throw new Error(insert.error.message);
      }
    }

    await supabase
      .from("documents")
      .update({
        status: "ready",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";
    await markFailed(supabase, documentId, message);
    throw error;
  }
};
