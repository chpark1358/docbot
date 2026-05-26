---
created_from: raw_sources/docbot-analysis.md
title: 스트리밍 채팅 엔진
---

# 스트리밍 채팅 엔진

`src/app/api/chat/route.ts` 하나가 모든 모드를 다룬다 (단일 라우트, 모드 분기).

## 처리 흐름

1. **모더이션** — OpenAI `omni-moderation-latest` 차단
2. **스레드** — `chat_threads` 생성 또는 기존 조회 (문서별 종속)
3. **히스토리 로드** — 최근 12~20개 메시지
4. **문맥 인식** — 지시문/참조 질문 감지 시 이전 메시지와 합쳐 임베딩 재조회
5. **검색** — [[document-rag-pipeline]] 의 RPC 호출 (모드별 분기)
6. **프롬프트 빌드** — `src/lib/prompt.ts` 가 시스템 + 컨텍스트 + 히스토리 + 질문 조립
7. **OpenAI 호출** — `gpt-4o-mini` 스트리밍
8. **응답 스트림** — ReadableStream + Server-Sent Events
9. **저장** — 어시스턴트 메시지를 `chat_messages`에 sources(JSONB)와 함께 저장
10. **제목 생성** — 첫 메시지면 `gpt-4o-mini`로 12자 이내 제목 자동 생성

## SSE 이벤트 포맷

| event type | payload |
|---|---|
| `chunk` | 토큰 델타 |
| `done` | sources 배열 (chunk id, 유사도, snippet) |
| `error` | 메시지 |

## 모드 3종

| 모드 | 라우트 분기 | 컨텍스트 |
|---|---|---|
| **Document** | 단일 doc | `match_chunks(doc_id)` 상위 6개 |
| **All-Docs** | 사용자 전체 ready 문서 | `match_chunks_all_user()` |
| **Web** | OpenAI Responses API + `web_search_preview` 도구 | LLM이 알아서 검색, 상위 6 URL 반환 |

## 한계
- 매 채팅마다 질문 임베딩 재생성 (캐싱 없음)
- 부분 컨텍스트 누락 시 사용자 알림 없음
- Web 모드의 인용 신뢰성 OpenAI 도구에 전적으로 의존

## 관련
- [[document-rag-pipeline]]
- [[db-schema]] — `chat_threads`, `chat_messages`
