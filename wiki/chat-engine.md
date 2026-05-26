---
created_from: raw_sources/docbot-analysis.md
title: 스트리밍 채팅 엔진
---

# 스트리밍 채팅 엔진

`src/app/api/chat/route.ts` 하나가 **단일 path** 로 모든 채팅을 처리한다.
이전의 3-모드 분기(Document / All-Docs / Web)는 LLM 자동 라우팅으로 대체됐다.

## 처리 흐름

1. **모더이션** — OpenAI `omni-moderation-latest` 차단
2. **스레드 setup** — `chat_threads` 조회 또는 신규 생성 (workspace 가상 문서에 묶임)
3. **히스토리 로드** — 최근 16개 메시지
4. **문맥 인식** — 짧거나 지시/참조 질문이면 직전 user 메시지와 합쳐 임베딩 쿼리 재구성
5. **RAG 검색** — [[document-rag-pipeline]] 의 RPC 호출
   - documentId가 실제 문서면 `match_chunks(doc_id, ...)`
   - 그 외(가상 문서 또는 미지정)는 `match_chunks_all_user(user_id, ...)`
   - 유사도 ≥ 0.35인 청크만 LLM context로 전달
6. **OpenAI 호출** — `openai.responses.create`
   - 모델: [[stack-and-deployment]] 의 `CHAT_MODEL` (`gpt-5.4-mini`)
   - tools: `[{ type: "web_search_preview", search_context_size: "medium" }]`
   - tool_choice: `auto` (LLM이 시점성 키워드 감지 시 자동 호출)
   - instructions: `prompt.system` (사내 문서 + 웹 통합 가이드, 시점성 키워드 강제 룰)
7. **응답 스트림** — ReadableStream + Server-Sent Events
8. **저장** — assistant 메시지를 `chat_messages` 에 sources(JSONB)와 함께 저장
9. **제목 자동 생성** — 첫 메시지면 `gpt-4o-mini` 로 12자 이내 제목 (비용 절감 모델)

## SSE 이벤트 포맷

| event type | payload | 용도 |
|---|---|---|
| `context` | `{ docCount }` | UI에 "사내 문서 N건 조회됨" 칩 표시 |
| `tool` | `{ tool: "web_search", status: "running"\|"completed" }` | "웹 검색 중/완료" 라이브 인디케이터 |
| `chunk` | `{ text }` | 토큰 델타 |
| `done` | `{ answer, sources[] }` | 최종 응답 + 출처(문서 + URL) |
| `error` | `{ message }` | 에러 |

## LLM 자동 라우팅

| 질문 유형 | LLM 동작 |
|---|---|
| 일반 사내 지식 (사내 문서가 답 가능) | 문서 컨텍스트만으로 답변, web_search 호출 안 함 |
| 시점성 키워드(`오늘/방금/최근/최신/이번 주/올해/뉴스/발표/출시/버전/가격/일정/정책 변경`) | **반드시** `web_search_preview` 호출 후 답변 |
| 사내 문서가 부족한 외부 사실 질문 | 자율 판단해 `web_search_preview` 호출 |
| 컨텍스트 충돌 (사내 문서 vs 웹) | 사내 문서 우선 (단, 사내 문서가 명백히 오래되면 그 점 명시) |

이 라우팅은 `src/lib/prompt.ts` 의 system prompt에 명시되어 있다.

## AbortController 통합 (스트리밍 중단)

클라이언트(`chat-client.tsx`)가 매 요청마다 `AbortController` 생성 →
`fetch(..., { signal })` 로 전달 → 사용자가 중단 버튼 누르면 `controller.abort()` →
서버 스트림이 깨지면서 클라이언트는 `AbortError`를 받아 부분 답변을 보존하고
"_답변이 중단되었습니다._"를 덧붙인다.

## 한계
- 매 채팅마다 질문 임베딩 재생성 (캐싱 없음)
- 웹 검색 인용의 신뢰성은 OpenAI의 검색 결과에 전적으로 의존
- 외부 도구(Slack / Notion / Drive)는 아직 LLM tool로 등록되지 않음 — UI 미리보기 단계

## 관련
- [[document-rag-pipeline]]
- [[db-schema]] — `chat_threads`, `chat_messages`
- [[stack-and-deployment]] — 모델 / 검색 컨텍스트 크기
