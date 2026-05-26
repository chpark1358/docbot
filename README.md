# Docbot

사내 문서와 인터넷을 함께 활용해 답변하는 가벼운 챗봇.
LLM이 질문에 따라 사내 문서 RAG와 웹 검색을 자동으로 라우팅합니다.

## 주요 기능

- **단일 채팅 UI** — 모드 선택 없이 LLM이 사내 문서 + 웹을 자동으로 활용
- **사내 문서 RAG** — PDF, DOCX, TXT 업로드 → pgvector 임베딩 → 의미 검색
- **웹 검색** — OpenAI Responses API의 `web_search_preview` built-in tool
- **답변 가독성** — 마크다운(헤딩/리스트/표/코드/인용) + 코드 syntax highlighting
- **다크 모드** — 시스템 기본 + 헤더 토글
- **답변 액션** — 복사 / 재생성 / 스트리밍 중단 (AbortController)
- **모바일 반응형** — 햄버거 메뉴 + slide-in 사이드바
- **공유 문서** — `is_shared` 플래그로 다른 사용자에게 read 허용

## 스택

- **Frontend**: React 19, Next.js 16 (App Router), TypeScript 5, Tailwind 3.4, Radix UI
- **Backend**: Next.js API Routes (Node runtime)
- **DB / Auth / Storage**: Supabase (Postgres + pgvector + Auth + Storage)
- **LLM**: OpenAI `gpt-5.4-mini` (채팅), `gpt-4o-mini` (모더/제목), `text-embedding-3-small` (임베딩), `omni-moderation-latest` (모더)
- **문서 파싱**: `pdf-parse`, `mammoth` (DOCX), OpenAI Vision (스캔 PDF fallback)

## 빠른 시작

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수

루트에 `.env.local` 생성:

```ini
# OpenAI (채팅, 임베딩, 웹 검색)
OPENAI_API_KEY=sk-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 3. Supabase 스키마 적용

`supabase/schema.sql` 를 Supabase SQL Editor에 붙여 실행합니다. 다음이 생성됩니다:

- 테이블: `documents`, `document_chunks`, `chat_threads`, `chat_messages`
- 인덱스:
  - 사용자/생성일
  - **IVFFlat on embedding** (`lists=100`) — 벡터 유사도
  - **GIN on content_tsv** — Postgres FTS (BM25-like)
- RPC:
  - `match_chunks(query_embedding, doc_id, ...)` — 벡터 only (단일 문서)
  - `match_chunks_all_user(query_embedding, ...)` — 벡터 only (사용자 전체)
  - `match_chunks_hybrid(query_text, query_embedding, doc_id, ...)` — **벡터 + FTS, Reciprocal Rank Fusion** (기본 사용)
- RLS: 모든 테이블 `user_id = auth.uid()` (공유 문서는 read 예외)
- Storage 버킷: `documents` (동일 RLS)

> 기존 DB가 있고 스키마만 업그레이드한다면, 위 파일의 `alter table public.document_chunks add column ... content_tsv ...` 와 `match_chunks_hybrid` 함수 정의 두 블록만 떼어 실행하면 됩니다. `content_tsv` 는 generated 컬럼이라 기존 row 도 자동으로 채워집니다.

### 4. 개발 서버

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속 → 회원가입 → 문서 업로드 → 채팅.

## 스크립트

| 명령 | 동작 |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 server |
| `npm run lint` | ESLint |

## 배포

Vercel 권장. GitHub 레포 연결 → 위 환경 변수 등록 → 자동 배포.

빌드 시 `OPENAI_API_KEY` 가 비어 있으면 page-data collection 단계에서 실패합니다(OpenAI 클라이언트가 모듈 top-level에서 인스턴스화되기 때문). 더미 값이라도 반드시 설정. (후속 PR에서 lazy-init 으로 정리 예정)

## 도메인별 상세 문서

`wiki/` 폴더의 마크다운 페이지들을 참고:

- [Wiki 입구](wiki/index.md)
- [스택과 배포](wiki/stack-and-deployment.md)
- [문서 RAG 파이프라인](wiki/document-rag-pipeline.md)
- [스트리밍 채팅 엔진](wiki/chat-engine.md)
- [DB 스키마](wiki/db-schema.md)
- [인증과 공유](wiki/auth-and-sharing.md)

## 외부 도구 연동 (UI 미리보기 단계)

`/app/settings` 페이지에서 Slack, Notion, Google Drive 연결 카드를 확인할 수 있습니다. 실제 토큰 등록과 LLM tool calling 등록은 후속 작업으로 진행 예정입니다.

## 라이선스

내부 프로젝트.
