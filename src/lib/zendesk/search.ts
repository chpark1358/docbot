import { createServiceClient } from "@/lib/supabase/service";

export type FaqEmbedding = {
  id: number;
  faq_id: number | null;
  content: string | null;
  embedding: number[] | null;
  metadata: Record<string, unknown> | null;
};

export const fetchFaqEmbeddings = async (limit = 20): Promise<FaqEmbedding[]> => {
  const supabase = createServiceClient();
  const { data, error } = await (supabase.from as any)("faq_embeddings")
    .select("id, faq_id, content, embedding, metadata")
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return data as FaqEmbedding[];
};
