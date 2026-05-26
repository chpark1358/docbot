---
created_from: raw_sources/docbot-analysis.md
title: 문서 RAG 파이프라인
---

# 문서 RAG 파이프라인

문서를 업로드하면 백그라운드에서 파싱→청킹→임베딩→저장이 진행되고,
[[chat-engine]] 의 질문 시점에 pgvector 매칭으로 컨텍스트를 끌어온다.

## 단계

### 1. 업로드
- 라우트: `src/app/api/documents/upload/route.ts`, `upload-url/route.ts`
- Supabase Storage 버킷에 파일 저장 → `documents` 테이블에 메타 기록 (status=`queued`)
- 40MB 크기 제한 (최근 추가)

### 2. 파싱 (`src/lib/parse.ts`)
`parseBufferToText()` 폴백 체인:
1. **pdf-parse** (PDF)
2. **mammoth** (DOCX, haansoft DOCX MIME 포함)
3. **OpenAI Vision OCR** — pdf-parse가 빈 텍스트를 돌려준 스캔본 PDF용

### 3. 청킹 (`src/lib/chunk.ts`)
- 900자 단위, 150자 중복 윈도우 슬라이딩
- 청크별 metadata에 위치 정보 보관

### 4. 임베딩 (`src/lib/embeddings.ts`)
- 모델: `text-embedding-3-small` (1536-dim)
- 96개 단위 배치 호출
- **부분 실패 미지원**: 한 배치라도 실패하면 문서 전체가 `failed`

### 5. 저장
- `document_chunks` 테이블에 (content, embedding, metadata) insert
- 인덱스: IVFFlat on embedding (lists=100) — [[db-schema]] 참고
- 완료 시 `documents.status = 'ready'`

## 검색 (질문 시점)

- 위치: `src/app/api/chat/route.ts:583-741`
- 질문 임베딩 → RPC 호출:
  - 단일 문서: `match_chunks(query_embedding, doc_id, ...)`
  - 전체 문서(All-Docs): `match_chunks_all_user(query_embedding, ...)`
- 상위 6개 청크 추출
- 최소 유사도: **0.35**, 결과 부족하면 **0.2**로 완화 재조회
- (원본은 FAQ도 병렬 조회하지만 이 위키 범위에선 제외 — 재구성에서 잘라낼 부분)

## 가상 문서 (`src/lib/virtual-chat.ts`)
All-Docs 모드와 Web 모드에서 "현재 대화의 문서"를 가상으로 만들어
스레드/메시지 모델을 동일하게 재사용하기 위한 어댑터.

## 관련
- [[chat-engine]] — 검색 결과를 어떻게 프롬프트에 합치는지
- [[db-schema]] — `documents`, `document_chunks` 정의
- [[auth-and-sharing]] — `is_shared` 문서 접근 규칙
