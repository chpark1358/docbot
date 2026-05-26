---
created_from: raw_sources/docbot-analysis.md
title: 스택과 배포
---

# 스택과 배포

## 런타임
| 레이어 | 라이브러리/버전 |
|---|---|
| 프론트엔드 | React 19, Next.js 16.0.10, TypeScript 5 |
| 스타일 | Tailwind CSS 3.4, Radix UI (shadcn 설정만 있고 미사용) |
| API | Next.js App Router의 Route Handler (nodejs runtime) |
| 인증/DB | Supabase (SSR), Postgres + pgvector |
| LLM | OpenAI: `gpt-4o-mini`, `text-embedding-3-small` (1536-dim), `omni-moderation-latest`, Vision |
| 문서 처리 | `pdf-parse` 2.4.5, `mammoth` 1.11 (DOCX), `exceljs` 4.4 (XLSX — Zendesk 전용이므로 재구성 시 제거) |

## 환경 변수
필수:
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 라우트의 service 클라이언트용)

선택 (Zendesk 영역이라 재구성 시 제거 가능):
- `ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`, `ZENDESK_PRODUCT_FIELD_ID`, `ZENDESK_HANDLER_FIELD_ID`

## 빌드/스크립트
`package.json` scripts → `dev`, `build`, `start`, `lint` (Next.js 기본).

## 배포 환경
README는 Next.js 기본 템플릿 그대로 — Vercel 배포 의도로 보이나 운영 환경은 코드에서 확정되지 않음.

## 관련
- [[document-rag-pipeline]]
- [[chat-engine]]
- [[db-schema]]
