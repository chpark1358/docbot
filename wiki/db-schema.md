---
created_from: raw_sources/docbot-analysis.md
title: DB 스키마 (챗봇 본체)
---

# DB 스키마 — 챗봇 본체

이 페이지는 **챗봇 본체만** 다룬다. Zendesk/FAQ 테이블은 의도적으로 제외.

## 테이블

### `documents`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | auth.users 참조 |
| title | text | |
| status | text | `queued` / `processing` / `ready` / `failed` |
| mime_type | text | pdf/docx/txt 등 |
| is_shared | bool | [[auth-and-sharing]] 참고 |
| created_at | timestamptz | |

인덱스: `(user_id, created_at desc)`

### `document_chunks`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| document_id | uuid FK → documents | |
| user_id | uuid | RLS용 비정규화 |
| content | text | 청크 본문 |
| embedding | vector(1536) | text-embedding-3-small |
| metadata | jsonb | 위치, 페이지 등 |

인덱스: `(document_id)`, **IVFFlat on embedding (lists=100)**

### `chat_threads`
| 컬럼 | 타입 |
|---|---|
| id | uuid PK |
| document_id | uuid FK → documents |
| user_id | uuid |
| title | text (자동 생성, 12자 이내) |
| created_at | timestamptz |

인덱스: `(document_id)`

### `chat_messages`
| 컬럼 | 타입 |
|---|---|
| id | uuid PK |
| thread_id | uuid FK → chat_threads |
| user_id | uuid |
| role | text (`user` / `assistant`) |
| content | text |
| sources | jsonb (RAG 인용 메타) |
| created_at | timestamptz |

인덱스: `(thread_id, created_at)`

## RPC

### `match_chunks(query_embedding, doc_id, match_count, min_similarity)`
특정 문서 내 코사인 유사도 매칭.

### `match_chunks_all_user(query_embedding, user_id, match_count, min_similarity)`
사용자의 모든 ready 문서 + 공유 문서 매칭. All-Docs 모드용.

## RLS
모든 테이블: `user_id = auth.uid()`.
공유 문서(`is_shared = true`)는 read 정책에서 예외 — [[auth-and-sharing]].

## 제거 대상 (재구성에서)
- `zendesk_raw_tickets`, `zendesk_clean`, `zendesk_intent`, `zendesk_solution`, `zendesk_faq`
- `faq_embeddings`
- 위 테이블은 `supabase/schema.sql`에 정의조차 없고, 라우트에서 `(supabase.from as any)`로 참조 — 정리할 게 별로 없음 (스키마 파일은 손댈 필요 없음).

## 관련
- [[document-rag-pipeline]]
- [[chat-engine]]
- [[auth-and-sharing]]
