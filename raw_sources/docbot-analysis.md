# Docbot 프로젝트 분석 보고서

**원본 출처**: https://github.com/chpark1358/docbot
**분석 시점**: 2026-05-21
**대상 커밋**: `97a8ac9` (2026-01-19, main)
**클론 위치**: `/tmp/docbot-analysis`

---

## 한 줄 요약

Next.js 16 + Supabase + OpenAI 기반 **문서 RAG 챗봇 + Zendesk 티켓 → FAQ 자동 생성 파이프라인** 통합 시스템.
MVP를 넘어 기능 확장 단계.

---

## 스택

- **Frontend**: React 19, Next.js 16.0.10, TypeScript 5, Tailwind CSS 3.4, Radix UI
- **Backend**: Next.js API Routes (nodejs runtime), Supabase SSR (쿠키 기반 auth)
- **Database/Auth**: Supabase (Postgres + pgvector), Supabase Auth
- **LLM/Embeddings**: OpenAI (gpt-4o-mini, text-embedding-3-small, omni-moderation, Vision)
- **문서 처리**: pdf-parse 2.4.5, mammoth 1.11 (DOCX), ExcelJS 4.4 (XLSX 출력)

---

## 디렉터리 구조

```
src/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   ├── route.ts (핵심 대화 엔진)
│   │   │   └── threads/[id]/route.ts
│   │   ├── documents/
│   │   │   └── upload/, ingest/, upload-url/, [id]/route.ts
│   │   └── zendesk/
│   │       ├── search/, fetch-raw/, ingest/, process/, run-pipeline/
│   │       ├── export-csv/, export-xlsx/, export-support/
│   │       ├── approve/, embed/
│   │       └── faqs/
│   ├── app/                     # 로그인 후 protected 영역
│   │   ├── page.tsx (홈)
│   │   ├── documents/
│   │   ├── chats/[threadId]/
│   │   ├── zendesk/
│   │   └── _components/
│   ├── login/
│   └── layout.tsx
├── lib/
│   ├── embeddings.ts            # OpenAI Embeddings 배치
│   ├── chunk.ts                 # 텍스트 청킹 (900자, 150자 중복)
│   ├── parse.ts                 # PDF/DOCX 파싱 + OCR fallback
│   ├── process-document.ts      # 문서 처리 파이프라인
│   ├── prompt.ts                # RAG 프롬프트 빌더
│   ├── virtual-chat.ts          # 웹 검색/전체 문서용 가상 문서
│   ├── supabase/{server,browser,service}.ts
│   ├── zendesk/{pipeline,search,embedding}.ts
│   ├── constants.ts
│   └── database.types.ts
└── components/ui/
```

---

## 핵심 도메인

### 1. 문서 RAG 엔진

**파일**: `src/lib/process-document.ts`, `src/app/api/chat/route.ts:583-741`, `src/lib/embeddings.ts`

**파이프라인**:
1. **파싱**: `parseBufferToText()` (pdf-parse → mammoth → Vision OCR fallback)
2. **청킹**: 900자, 150자 중복 (`src/lib/chunk.ts`)
3. **임베딩**: OpenAI text-embedding-3-small, 96개 단위 배치
4. **저장**: `document_chunks` 테이블 (pgvector 1536-dim, IVFFlat lists=100)

**검색**:
- 질문 임베딩 → `match_chunks()` RPC → 상위 6개 + FAQ 병렬 조회
- 최소 유사도 0.35 (완화 재조회 시 0.2)

**모드 3종**:
- Document: 특정 문서 대상
- All-Docs: 사용자의 모든 ready 문서 대상 (가상 문서 활용)
- Web: OpenAI Responses API의 web_search_preview

---

### 2. 실시간 스트리밍 채팅

**파일**: `src/app/api/chat/route.ts:340-422` (웹), `:503-561` (문서)

**플로우**:
- 모더이션 (omni-moderation-latest) → 스레드 생성/조회
- 대화 히스토리 로드 (최근 12~20개)
- 문맥 인식: 지시문/참조 질문 감지 → 이전 메시지와 결합해 임베딩 재조회
- ReadableStream + Server-Sent Events
  - `type: chunk` (델타)
  - `type: done` + 출처 메타 (유사도, 스니펫)
- 제목 자동 생성 (gpt-4o-mini, 12자 이내)

---

### 3. Zendesk 파이프라인 (이번 재구성에선 제외 대상)

4단계 LLM 정제: Fetch-Raw → Ingest → Process(Clean→Intent→Solution→FAQ) → Approve.
최근 1~2주 작업의 대부분이 이 영역(특히 Support Export XLSX).

---

### 4. FAQ 관리/임베딩 (이번 재구성에선 제외 대상)

`zendesk_faq` candidate → approved → `faq_embeddings` 별도 테이블에 임베딩.
채팅 시 문서 점수 + FAQ 점수 병렬 조회.

---

### 5. 인증/권한/공유

**패턴**: Supabase SSR (쿠키 기반)
- 미들웨어: `/app`, `/login` 보호
- 모든 테이블 RLS `user_id = auth.uid()`
- 공유 문서: `is_shared` 플래그로 다른 사용자 읽기 권한

---

## DB 스키마

### 문서 관련 (재구성 시 유지)

| 테이블 | 주요 컬럼 | 관계 |
|---|---|---|
| **documents** | id (UUID), user_id, title, status, mime_type, is_shared | — |
| **document_chunks** | id, document_id (FK), user_id, content, embedding (vector/1536), metadata | documents |
| **chat_threads** | id, document_id (FK), user_id, title | documents |
| **chat_messages** | id, thread_id (FK), user_id, role, content, sources (JSONB) | chat_threads |

**인덱스**:
- documents: (user_id, created_at desc)
- document_chunks: (document_id), IVFFlat on embedding (lists=100)
- chat_threads: (document_id), chat_messages: (thread_id, created_at)

**RPC**:
- `match_chunks(query_embedding, doc_id, ...)`
- `match_chunks_all_user(query_embedding, ...)`

### Zendesk/FAQ 관련 (재구성 시 제거)

zendesk_raw_tickets / zendesk_clean / zendesk_intent / zendesk_solution / zendesk_faq / faq_embeddings.
**중요**: `supabase/schema.sql`에 정의되지 않음. API 라우트가 `(supabase.from as any)`로 동적 참조.

---

## 최근 작업 흐름

### 2026-01-14 ~ 01-19 (Zendesk 강화 스프린트)
Zendesk Support Export(XLSX), custom_status_id 필터, 페이지네이션, UTF-8 파일명, 커스텀 필드(제품/담당자) 매핑.

### 2025-12 말 (파이프라인)
Ingest/Process 버튼 분리, run-pipeline 원클릭, FAQ 답변 포맷팅.

### 2025-12 초 (문서 기능)
공유 토글/배지, Vision OCR fallback, 40MB 제한, haansoft DOCX 지원.

---

## 주의사항

1. **Zendesk 스키마 마이그레이션 누락** — `schema.sql`에 zendesk_* 정의 없음, 동적 참조로 회피
2. **N+1 패턴** — Zendesk search 후 사용자/조직 정보 재조회
3. **부분 실패 미지원** — 임베딩 배치 실패하면 문서 전체 실패
4. **캐싱 부재** — 매 채팅 시 질문 임베딩 재생성
5. **IVFFlat lists=100** — 대규모 임베딩 시 재조정 필요
6. **타입 우회 다수** — `(supabase as any)`, `(supabase.from as any)`
7. **shadcn 미사용** — `components.json`은 있지만 UI는 직접 구성

---

## 재구성 시 제거 후보

- `src/app/api/zendesk/*` (10개 라우트)
- `src/lib/zendesk/*` (pipeline.ts, search.ts, embedding.ts)
- `src/app/app/zendesk/*` (UI)
- 채팅 라우트의 FAQ 병렬 조회 분기
- ExcelJS 의존성 (XLSX export용)
- `zendesk_*`, `faq_embeddings` 테이블 (DB에 이미 있다면 별도 정리)

## 재구성 시 유지

- 문서 업로드/파싱/청킹/임베딩 파이프라인
- 채팅 스트리밍 (SSE)
- 3모드 (Document / All-Docs / Web) — Web은 선택사항
- 인증, 공유, RLS
