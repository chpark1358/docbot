---
created_from: raw_sources/docbot-analysis.md
title: 인증과 공유
---

# 인증과 공유

## 인증 모델
- **Supabase Auth + SSR** (쿠키 기반)
- 클라이언트: `src/lib/supabase/browser.ts`
- 서버 컴포넌트/라우트: `src/lib/supabase/server.ts` (`createClient()` → `cookies()`)
- 서비스 키(관리자 작업용): `src/lib/supabase/service.ts`

## 미들웨어 (`middleware.ts`)
- `/app`, `/login` 매칭
- 세션 갱신 + 로그인 안 됐으면 `/login`으로 리다이렉트
- (Zendesk 라우트도 미들웨어 보호 받지만 재구성 시 제거 예정)

## 로그인 화면
`src/app/login/` — 이메일/비밀번호 방식 Supabase Auth.

## RLS 정책
모든 챗봇 테이블 (`documents`, `document_chunks`, `chat_threads`, `chat_messages`):
```sql
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid())
```
Storage `documents` 버킷도 동일 규칙.

## 공유 모델 (`is_shared`)
- `documents.is_shared = true` 인 문서는 **다른 사용자가 read 가능**
- 정책 예외:
  ```sql
  USING (user_id = auth.uid() OR is_shared = true)
  ```
- All-or-nothing 공유 — 특정 사용자/조직 지정 불가
- UI: 공유 토글 + 공유 배지 (2025-12 추가)
- 미해결 질문: "조직 전체 공유" 의도인지 "퍼블릭 링크" 의도인지 코드만으로는 모호

## 관련
- [[db-schema]] — RLS 적용 테이블
- [[document-rag-pipeline]] — 공유 문서를 All-Docs 검색에 포함
