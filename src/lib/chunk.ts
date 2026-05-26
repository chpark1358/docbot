import { CHUNK_OVERLAP, CHUNK_SIZE } from "@/lib/constants";

const normalizeWhitespace = (text: string) =>
  text
    .replace(/\r\n|\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]+/g, " ")
    .trim();

const sliceWithOverlap = (text: string, size: number, overlap: number): string[] => {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const slice = text.slice(start, end).trim();
    if (slice) out.push(slice);
    start += size - overlap;
  }
  return out;
};

export type SectionAwareChunk = {
  content: string;
  sectionPath: string[];
};

/**
 * 마크다운 헤딩(`#` ~ `######`) 을 인식해 각 청크가 어느 섹션 소속인지 기록한다.
 * 헤딩이 전혀 없는 일반 텍스트(예: PDF/TXT 일부)는 빈 sectionPath 로 반환된다.
 */
export const chunkTextWithSections = (
  input: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): SectionAwareChunk[] => {
  const text = normalizeWhitespace(input);
  if (!text) return [];

  const lines = text.split("\n");
  const sections: { path: string[]; body: string }[] = [];
  let currentPath: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ path: [...currentPath], body });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      currentPath = currentPath.slice(0, level - 1);
      currentPath[level - 1] = title;
      currentPath = currentPath.slice(0, level);
      continue;
    }
    buffer.push(rawLine);
  }
  flush();

  if (!sections.length) {
    return sliceWithOverlap(text, size, overlap).map((content) => ({ content, sectionPath: [] }));
  }

  const chunks: SectionAwareChunk[] = [];
  for (const section of sections) {
    const subs = sliceWithOverlap(section.body, size, overlap);
    for (const sub of subs) {
      chunks.push({ content: sub, sectionPath: section.path });
    }
  }
  return chunks;
};

/**
 * 후방 호환용: 기존 호출자는 section path 없이 텍스트만 필요로 한다.
 */
export const chunkText = (input: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] =>
  chunkTextWithSections(input, size, overlap).map((c) => c.content);
