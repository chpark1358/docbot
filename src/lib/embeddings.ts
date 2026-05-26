import { EMBEDDING_MODEL } from "@/lib/constants";
import { getOpenAI } from "@/lib/openai";

const EMBEDDING_BATCH_SIZE = 96;

export const embedChunks = async (chunks: string[]): Promise<number[][]> => {
  if (!chunks.length) return [];

  const openai = getOpenAI();
  const embeddings: number[][] = [];

  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    embeddings.push(...sorted.map((item) => item.embedding));
  }

  return embeddings;
};
