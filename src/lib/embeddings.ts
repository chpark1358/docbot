import OpenAI from "openai";
import { EMBEDDING_MODEL } from "@/lib/constants";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const embedChunks = async (chunks: string[]): Promise<number[][]> => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  if (!chunks.length) return [];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: chunks,
  });

  return response.data.map((item) => item.embedding);
};
