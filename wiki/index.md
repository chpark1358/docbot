---
created_from: raw_sources/docbot-analysis.md
title: Docbot Wiki 입구
---

# Docbot Wiki

GitHub 레포 [chpark1358/docbot](https://github.com/chpark1358/docbot)의 챗봇 본체를 정리한 위키.
**Zendesk/FAQ 도메인은 PR #1에서 제거**된 상태를 기준으로 작성되어 있다.

## 페이지

- [[stack-and-deployment]] — 어떤 기술로 어떻게 돌아가는지 (모델, 의존성, 배포)
- [[document-rag-pipeline]] — 업로드 → 파싱 → 청킹 → 임베딩 → 매칭
- [[chat-engine]] — 단일 path 채팅 라우트, LLM 자동 라우팅, SSE 이벤트, AbortController
- [[db-schema]] — 챗봇이 사용하는 4개 테이블 + RPC
- [[auth-and-sharing]] — Supabase SSR auth와 `is_shared` 공유 모델

## 출처
- 원본 코드: 본 레포 (현재 main)
- 분석 스냅샷: `raw_sources/docbot-analysis.md` (2026-05-21 시점, 일부는 stale — 현재 코드와 위키가 우선)

## 업데이트 이력
- **2026-05-26** — PR #2 머지 후 단일 path 챗봇 반영, PR #4 머지 후 UI/UX/모델 변경 반영, PR #5에서 README + 위키 갱신
