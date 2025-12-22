import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ALL_DOCS_MIME_TYPE, VIRTUAL_CHAT_MIME_TYPE } from "@/lib/constants";

type Supabase = SupabaseClient<Database>;

export const ensureVirtualChatDocumentId = async (supabase: Supabase, userId: string): Promise<string> => {
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("user_id", userId)
    .eq("mime_type", VIRTUAL_CHAT_MIME_TYPE)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: inserted, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      title: "웹 검색 대화",
      storage_path: `${userId}/__virtual__/web-chat`,
      mime_type: VIRTUAL_CHAT_MIME_TYPE,
      size: 0,
      status: "ready",
      error_message: null,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    throw new Error(error?.message ?? "웹 채팅용 문서를 생성할 수 없습니다.");
  }

  return inserted.id;
};

export const isVirtualChatDocument = (mimeType: string | null | undefined) => mimeType === VIRTUAL_CHAT_MIME_TYPE;

export const ensureAllDocsVirtualDocumentId = async (supabase: Supabase, userId: string): Promise<string> => {
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

export const isAllDocsVirtualDocument = (mimeType: string | null | undefined) => mimeType === ALL_DOCS_MIME_TYPE;
