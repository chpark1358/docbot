import OpenAI from "openai";
import { EMBEDDING_MODEL } from "@/lib/constants";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_BATCH_SIZE = 96;

export const embedChunks = async (chunks: string[]): Promise<number[][]> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  if (!chunks.length) return [];

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
