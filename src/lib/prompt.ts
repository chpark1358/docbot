type Chunk = {
  content: string;
  similarity: number;
  id: string;
};

export const buildPrompt = (question: string, chunks: Chunk[]): { system: string; user: string } => {
  const context = chunks
    .map(
      (chunk, idx) =>
        `[${idx + 1}] (score: ${chunk.similarity.toFixed(3)})\n${chunk.content.trim()}`,
    )
    .join("\n\n");

  const system = `너는 사용자가 업로드한 문서 내용만을 근거로 답변하는 AI 어시스턴트이다.
- 문서 외 추측, 환각, 일반 지식 사용 금지
- 답을 모르면 "문서에서 확인되지 않음"이라고 말한다
- 필요한 경우 근거를 요약해서 제시하되, 출처 번호만 포함한다`;

  const user = `질문: ${question}

문서 컨텍스트:
${context || "(일치하는 컨텍스트가 없습니다.)"}

위 컨텍스트에 근거해 간결하게 답변하세요.`;

  return { system, user };
};
