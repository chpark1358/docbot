---
created_from: raw_sources/docbot-analysis.md
title: 스택과 배포
---

# 스택과 배포

## 런타임
| 레이어 | 라이브러리/버전 |
|---|---|
| 프론트엔드 | React 19, Next.js 16.0.10, TypeScript 5 |
| 스타일 | Tailwind CSS 3.4, Radix UI (shadcn 설정만 있고 미사용), next-themes (다크모드) |
| 마크다운 | react-markdown + remark-gfm + rehype-highlight (코드 highlighting) |
| API | Next.js App Router의 Route Handler (nodejs runtime) |
| 인증/DB | Supabase (SSR), Postgres + pgvector |
| LLM (채팅) | OpenAI `gpt-5.4-mini` via Responses API + `web_search_preview` built-in tool (`search_context_size: "medium"`) |
| LLM (부수) | `gpt-4o-mini` (제목 자동 생성), `omni-moderation-latest` (모더), `text-embedding-3-small` 1536-dim (RAG 임베딩) |
| 문서 처리 | `pdf-parse`, `mammoth` (DOCX, haansoft DOCX 포함), OpenAI Vision (스캔 PDF fallback) |

## 환경 변수
필수:
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 라우트의 service 클라이언트용)

빌드 시 `OPENAI_API_KEY`가 비어 있으면 page-data collection 단계가 실패한다(OpenAI 클라이언트가 모듈 top-level에서 인스턴스화). lazy-init 리팩토링은 후속 작업.

## 빌드/스크립트
`package.json` scripts → `dev`, `build`, `start`, `lint` (Next.js 기본).

## 배포 환경
Vercel 자동 배포 — main에 머지되면 [`docbot-iota.vercel.app`](https://docbot-iota.vercel.app) 에 반영. PR마다 preview deployment.

## 관련
- [[document-rag-pipeline]]
- [[chat-engine]]
- [[db-schema]]
