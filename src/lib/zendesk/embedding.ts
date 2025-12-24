import { createServiceClient } from "@/lib/supabase/service";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const embeddingModel = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

export async function embedFaq(faqId: number) {
  const supabase = createServiceClient();
  const { data: faq, error } = await (supabase.from as any)("zendesk_faq")
    .select("id, faq_question, faq_answer")
    .eq("id", faqId)
    .eq("approved", true)
    .maybeSingle();
  if (error || !faq) throw new Error(error?.message ?? "FAQ not found or not approved");

  const content = `${faq.faq_question ?? ""}\n\n${faq.faq_answer ?? ""}`;
  const embedRes = await openai.embeddings.create({
    model: embeddingModel,
    input: content,
  });
  const vector = embedRes.data[0]?.embedding;
  if (!vector) throw new Error("embedding failed");

  await (supabase.from as any)("faq_embeddings").upsert({
    faq_id: faq.id,
    content,
    embedding: vector,
    metadata: { source: "zendesk" },
  });

  return { faq_id: faq.id, dim: vector.length };
}
