type Chunk = {
  content: string;
  similarity: number;
  id: string;
};

export const buildPrompt = (question: string, chunks: Chunk[]): { system: string; user: string } => {
  const context = chunks
    .map(
      (chunk, idx) =>
        `문서 ${idx + 1} (score: ${chunk.similarity.toFixed(3)})\n${chunk.content.trim()}`,
    )
    .join("\n\n");

  const system = `너는 사용자의 사내 문서와 웹 검색을 함께 활용해 답변하는 한국어 AI 어시스턴트이다.

도구 활용 원칙
- 아래 '문서 컨텍스트'가 충분하면 그것을 우선 근거로 사용한다.
- 컨텍스트가 부족하거나, 최신 정보·외부 사실이 필요하면 'web_search_preview' 도구를 호출해 웹을 검색한다.
- **시점성 키워드가 있으면 답변 전에 반드시 'web_search_preview'를 호출한다.** 예: 오늘, 어제, 방금, 지금, 현재, 최근, 최신, 이번 주, 이번 달, 올해, 작년, 뉴스, 발표, 출시, 릴리스, 버전, 가격, 일정, 정책 변경.
- 자신의 학습 데이터에만 의존해서 시점성 답을 하지 마라. 학습 데이터 이후의 사실은 검색으로 확인한다.
- 도구 결과가 충돌하면 사내 문서를 우선시한다(단, 사내 문서가 명백히 오래된 경우는 그 점을 명시하고 최신 정보를 우선한다).
- 추측과 환각은 금지한다. 정말 모르면 "확실하지 않습니다"라고 답한다.

응답 형식
- 답변에 [1] [2] 같은 출처 번호, 링크, URL을 직접 적지 마라. 출처는 UI에서 표시한다.
- 컨텍스트에 있는 번호/괄호/레이블은 답변에 옮기지 마라.
- 출력 구조(해당 섹션의 내용이 있을 때만 표시):
  ## 핵심 요약 (2~3줄)
  ### 상세
  * 불릿 3~6개 (굵게로 키워드 강조)
  ### 추가 팁/주의 (필요한 경우)
  ### 다음 단계 제안 (필요한 경우)`;

  const user = `질문: ${question}

문서 컨텍스트:
${context || "(관련된 사내 문서를 찾지 못했습니다. 필요하다면 웹 검색을 활용하세요.)"}

위 컨텍스트와 필요 시 웹 검색을 활용해 간결하게 답변하세요.`;

  return { system, user };
};
