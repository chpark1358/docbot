import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ALL_DOCS_MIME_TYPE, VIRTUAL_CHAT_MIME_TYPE } from "@/lib/constants";

type Supabase = SupabaseClient<Database>;

/**
 * 모든 채팅 스레드는 chat_threads.document_id NOT NULL 제약 때문에 어떤 문서든
 * 가리켜야 한다. 사용자가 실제 문서를 고르지 않고 시작하는 일반 채팅을 위해
 * 사용자당 하나의 "workspace 가상 문서" 를 만들어 그 id 를 anchor 로 사용한다.
 */
export const ensureAllDocsVirtualDocumentId = async (
  supabase: Supabase,
  userId: string,
): Promise<string> => {
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("user_id", userId)
    .eq("mime_type", ALL_DOCS_MIME_TYPE)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: inserted, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      title: "모든 문서 대화",
      storage_path: `${userId}/__virtual__/all-docs-chat`,
      mime_type: ALL_DOCS_MIME_TYPE,
      size: 0,
      status: "ready",
      error_message: null,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    throw new Error(error?.message ?? "전체 문서 대화용 리소스를 생성할 수 없습니다.");
  }

  return inserted.id;
};

/**
 * mime_type 이 가상 문서(workspace 또는 legacy 웹 채팅)인지 판정.
 * RAG 검색 시 가상 문서는 제외해야 한다.
 */
export const isVirtualDocumentMime = (mime: string | null | undefined): boolean =>
  mime === ALL_DOCS_MIME_TYPE || mime === VIRTUAL_CHAT_MIME_TYPE;
