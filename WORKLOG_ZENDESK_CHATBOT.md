# 챗봇 & Zendesk 개발 메모 (2025-01-04 기준)

## 주요 기능 개요
- 문서 챗봇 (Next.js 16, Supabase, OpenAI)
  - 업로드: pdf / docx / txt (40MB), haansoft docx MIME 허용
  - 파싱: pdf-parse → pdfjs fallback → (옵션) 1페이지 Vision OCR(캔버스가 있을 때만) → 텍스트 없으면 최소 청크 생성
  - 검색: “모든 문서” 모드에서 공유 문서 포함, RPC `match_chunks_all_user` 사용
  - 공유: 업로드 시 “공유” 체크박스 → `documents.is_shared` 저장, 소유자만 삭제/다운로드
  - UI: 채팅 입력창 고정/스크롤 패딩 조정, 답변 소스 카드 패널
- Zendesk FAQ 자동화
  - 수집/정제/후보 생성 파이프라인: `ingest`(Zendesk 검색→raw 저장, persist=true) → `process`(OpenAI 4회 호출로 clean/intent/solution/faq) → 승인 → `embed`
  - 승인: `/app/zendesk/approve`에서 후보/승인됨 탭, 승인 시 자동 임베딩
  - 파이프라인 실행: `/api/zendesk/run-pipeline` (ingest→process), UI 버튼 추가
  - 실행 단일 버튼 분리: ingest만, process만, 원클릭(ingest→process)
  - FAQ 렌더링: [원인]/[확인 방법]/[조치 사항] 섹션 감지, 번호 리스트는 `<ol>`로 가독성 향상
  - FAQ 정렬: id 오름차순 표시

## 중요 환경변수
- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- OpenAI: `OPENAI_API_KEY`, 모델 기본값 `gpt-4o-mini` (챗/비전), 임베딩 `text-embedding-3-small`
- Zendesk: `ZENDESK_SUBDOMAIN=jiransoft`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`
- (선택) `CRON_KEY` : `/api/zendesk/run-pipeline` 호출 시 `X-CRON-KEY` 헤더
- (선택) `NEXT_PUBLIC_SITE_URL` : run-pipeline origin 지정

## DB/RLS/함수 설정
- documents/document_chunks RLS (공유 포함):
  ```sql
  -- documents
  create policy if not exists "doc_select" on documents for select to authenticated
  using (is_shared = true or user_id = auth.uid());
  create policy if not exists "doc_update" on documents for update to authenticated
  using (user_id = auth.uid());
  create policy if not exists "doc_delete" on documents for delete to authenticated
  using (user_id = auth.uid());

  -- document_chunks
  create policy if not exists "chunk_select" on document_chunks for select to authenticated
  using (exists (
    select 1 from documents d
    where d.id = document_id and (d.is_shared = true or d.user_id = auth.uid())
  ));
  ```
- 공유 컬럼: `alter table documents add column if not exists is_shared boolean default false not null;`
- 검색 함수 (공유 포함, 단일 시그니처):
  ```sql
  drop function if exists public.match_chunks_all_user(int, vector, double precision);
  drop function if exists public.match_chunks_all_user(vector, int, double precision);
  create or replace function public.match_chunks_all_user(
    query_embedding vector,
    match_count int default 12,
    similarity_threshold double precision default 0
  )
  returns table(id uuid, document_id uuid, doc_title text, content text, similarity double precision)
  language plpgsql security definer set search_path = public as $$
  declare requester uuid := auth.uid();
  begin
    if requester is null then raise exception 'not authenticated'; end if;
    return query
    select dc.id, dc.document_id, d.title, dc.content,
           1 - (dc.embedding <=> query_embedding) as similarity
    from document_chunks dc
    join documents d on d.id = dc.document_id
    where (d.is_shared = true or d.user_id = requester)
      and (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    order by dc.embedding <=> query_embedding
    limit match_count;
  end;
  $$;
  ```
- Zendesk 파이프라인 테이블 인덱스 (upsert onConflict용):
  ```sql
  create unique index if not exists zendesk_clean_raw_id_key on zendesk_clean(raw_id);
  create unique index if not exists zendesk_intent_clean_id_key on zendesk_intent(clean_id);
  create unique index if not exists zendesk_solution_intent_id_key on zendesk_solution(intent_id);
  create unique index if not exists zendesk_faq_intent_id_key on zendesk_faq(intent_id);
  ```

## 주요 파일/엔드포인트
- 문서 파싱: `src/lib/parse.ts` (pdf-parse → pdfjs fallback → 옵션 Vision OCR 1페이지)
- 문서 처리: `src/lib/process-document.ts`
- 채팅 API: `src/app/api/chat/route.ts` (all-docs 모드에서 공유 문서 포함, 임계치 fallback 두 단계)
- 문서 공유 UI: `src/app/app/_components/upload-form.tsx` (공유 체크박스), `documents-client.tsx`
- Zendesk 파이프라인:
  - `src/app/api/zendesk/ingest/route.ts` (Zendesk search → raw 저장, persist=true)
  - `src/app/api/zendesk/process/route.ts` + `src/lib/zendesk/pipeline.ts` (clean/intent/solution/faq 생성, OpenAI 4회 호출, JSON 전용 프롬프트)
  - `src/app/api/zendesk/approve/route.ts` (승인 시 자동 임베딩)
  - `src/app/api/zendesk/embed/route.ts`
  - `src/app/api/zendesk/run-pipeline/route.ts` (ingest→process)
  - UI: `/app/zendesk/approve` 버튼 3개(ingest, process, 원클릭) + 후보/승인 관리, 답변 섹션 렌더링

## 최근 주요 커밋 (요약)
- `feat: shared docs view and vision ocr fallback` — 공유 문서 표시/다운로드 제한 + Vision OCR fallback
- `fix: include shared docs in all-doc search and access` — all-docs 모드에서 공유 문서 포함
- `feat: add run-pipeline endpoint` — Zendesk 파이프라인 일괄 실행 API
- `feat: add run-pipeline button on approve page` — 승인 화면에 파이프라인 트리거 버튼
- `fix: use chat.completions json for zendesk pipeline` — OpenAI 호출 안정화(JSON 전용)
- `chore: surface supabase errors in zendesk pipeline` — process 에러 메시지 개선
- `feat: format faq answer sections for readability` — FAQ 섹션 카드/리스트 렌더링
- `chore: show faq candidates in ascending id order` — 후보 정렬
- `feat: split zendesk pipeline buttons (ingest / process / one-click)` — 버튼 분리
- `chore: render faq sections with numbered lists` — 번호 리스트 가독성 개선

## 흔히 겪는 문제 & 대처
- ingest 500: Preview 환경에 Zendesk/Supabase env 미주입 → env 확인 후 재배포. detail 필드 확인.
|- process 에러 `no unique ... onConflict`: 테이블 유니크 인덱스 추가 필요(위 SQL).
- OpenAI `response_format` 오류: chat.completions + JSON 전용 프롬프트로 수정 완료.
- 공유 문서 검색 안 됨: RLS/`match_chunks_all_user` 단일 함수 적용, `is_shared=true` 확인.

## 다음에 할 만한 것
- process 배치 크기/타임아웃 조정(limit 20~50), 실행 로그 테이블 추가
- FAQ 생성 프롬프트 정제(길이 제한, 금칙어 등)
- CRON/스케줄러 연결(`run-pipeline` + CRON_KEY) 및 실행 내역 UI 표시
- 필요 시 모델 업그레이드(예: gpt-5.2-codex) 시험 후 비용/품질 비교
