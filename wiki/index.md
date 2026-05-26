---
created_from: raw_sources/docbot-analysis.md
title: Docbot Wiki 입구
---

# Docbot Wiki

원본 GitHub 레포 [chpark1358/docbot](https://github.com/chpark1358/docbot)의 핵심을 정리한 위키.
**Zendesk/FAQ 도메인은 의도적으로 제외** — 이 위키는 챗봇 본체(문서 RAG + 스트리밍 채팅) 재구성을 위한 참고서.

## 페이지

- [[stack-and-deployment]] — 어떤 기술로 어떻게 돌아가는지
- [[document-rag-pipeline]] — 업로드 → 파싱 → 청킹 → 임베딩 → 매칭
- [[chat-engine]] — 스트리밍 채팅, 3모드, 모더이션, 제목 자동 생성
- [[db-schema]] — 챗봇이 사용하는 4개 테이블 + RPC
- [[auth-and-sharing]] — Supabase SSR auth와 `is_shared` 공유 모델

## 출처
- `raw_sources/docbot-analysis.md` (전체 분석 보고서)
- 원본 코드: `/tmp/docbot-analysis` (클론본)
- 최신 커밋: `97a8ac9` (2026-01-19)
