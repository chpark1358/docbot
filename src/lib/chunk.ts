import { CHUNK_OVERLAP, CHUNK_SIZE } from "@/lib/constants";

const normalizeWhitespace = (text: string) =>
  text
    .replace(/\r\n|\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/ +/g, " ")
    .trim();

export const chunkText = (input: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] => {
  const text = normalizeWhitespace(input);
  if (!text) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const slice = text.slice(start, end).trim();
    if (slice) {
      chunks.push(slice);
    }
    start += size - overlap;
  }

  return chunks;
};
