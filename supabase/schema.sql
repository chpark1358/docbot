-- Supabase 스키마 정의 (문서 기반 챗봇 MVP)
-- 실행 위치: Supabase SQL Editor 또는 CLI migration

-- 확장
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- 테이블: documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  storage_path text not null,
  mime_type text not null,
  size bigint not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;
create index if not exists documents_user_id_created_at_idx on public.documents (user_id, created_at desc);

-- 테이블: document_chunks
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.document_chunks enable row level security;
create index if not exists document_chunks_document_id_idx on public.document_chunks (document_id);
create index if not exists document_chunks_embedding_idx on public.document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 테이블: chat_threads
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_threads enable row level security;
create index if not exists chat_threads_document_id_idx on public.chat_threads (document_id);

-- 테이블: chat_messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;
create index if not exists chat_messages_thread_id_created_at_idx on public.chat_messages (thread_id, created_at);

-- RLS 정책: user_id = auth.uid()
create policy "documents_select_own" on public.documents
  for select using (user_id = auth.uid());
create policy "documents_insert_own" on public.documents
  for insert with check (user_id = auth.uid());
create policy "documents_update_own" on public.documents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "documents_delete_own" on public.documents
  for delete using (user_id = auth.uid());

create policy "document_chunks_select_own" on public.document_chunks
  for select using (user_id = auth.uid());
create policy "document_chunks_insert_own" on public.document_chunks
  for insert with check (user_id = auth.uid());
create policy "document_chunks_delete_own" on public.document_chunks
  for delete using (user_id = auth.uid());

create policy "chat_threads_select_own" on public.chat_threads
  for select using (user_id = auth.uid());
create policy "chat_threads_insert_own" on public.chat_threads
  for insert with check (user_id = auth.uid());
create policy "chat_threads_delete_own" on public.chat_threads
  for delete using (user_id = auth.uid());

create policy "chat_messages_select_own" on public.chat_messages
  for select using (user_id = auth.uid());
create policy "chat_messages_insert_own" on public.chat_messages
  for insert with check (user_id = auth.uid());
create policy "chat_messages_delete_own" on public.chat_messages
  for delete using (user_id = auth.uid());

-- 유사도 검색 함수 (문서 단위 top-K)
create or replace function public.match_chunks (
  query_embedding vector(1536),
  doc_id uuid,
  match_count int default 5,
  similarity_threshold float default 0.0
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
begin
  if requester is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    dc.id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where dc.document_id = doc_id
    and dc.user_id = requester
    and d.user_id = requester
    and (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 유사도 검색 함수 (사용자 소유 모든 문서 대상)
create or replace function public.match_chunks_all_user (
  query_embedding vector(1536),
  match_count int default 6,
  similarity_threshold float default 0.0
)
returns table (
  id uuid,
  document_id uuid,
  doc_title text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
begin
  if requester is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    dc.id,
    dc.document_id,
    d.title as doc_title,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where dc.user_id = requester
    and d.user_id = requester
    and d.status = 'ready'
    and d.mime_type not in ('application/x-virtual-chat', 'application/x-all-docs')
    and (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Hybrid search: BM25 (Postgres FTS) + vector
-- content_tsv 는 generated 컬럼이라 기존 row 도 자동으로 채워진다.
alter table public.document_chunks
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists document_chunks_content_tsv_idx
  on public.document_chunks using gin (content_tsv);

-- vector 결과와 FTS 결과를 Reciprocal Rank Fusion 으로 합쳐 상위 K 를 반환한다.
-- doc_id 가 null 이면 사용자 본인 + 공유 문서 전체 대상, 지정되면 그 문서로 한정.
create or replace function public.match_chunks_hybrid (
  query_text text,
  query_embedding vector(1536),
  doc_id uuid default null,
  match_count int default 8,
  similarity_threshold float default 0.0,
  rrf_k int default 60
)
returns table (
  id uuid,
  document_id uuid,
  doc_title text,
  content text,
  metadata jsonb,
  similarity float,
  rrf_score float,
  fts_hit boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  fanout int := greatest(match_count * 3, 24);
begin
  if requester is null then
    raise exception 'not authenticated';
  end if;

  return query
  with vector_hits as (
    select
      dc.id,
      dc.document_id,
      d.title as doc_title,
      dc.content,
      dc.metadata,
      1 - (dc.embedding <=> query_embedding) as similarity,
      row_number() over (order by dc.embedding <=> query_embedding) as rank
    from public.document_chunks dc
    join public.documents d on d.id = dc.document_id
    where
      (doc_id is null or dc.document_id = doc_id)
      and ((dc.user_id = requester and d.user_id = requester) or d.is_shared = true)
      and d.status = 'ready'
      and d.mime_type not in ('application/x-virtual-chat', 'application/x-all-docs')
      and (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    order by dc.embedding <=> query_embedding
    limit fanout
  ),
  fts_hits as (
    select
      dc.id,
      dc.document_id,
      d.title as doc_title,
      dc.content,
      dc.metadata,
      ts_rank_cd(dc.content_tsv, plainto_tsquery('simple', query_text)) as fts_rank,
      row_number() over (
        order by ts_rank_cd(dc.content_tsv, plainto_tsquery('simple', query_text)) desc
      ) as rank
    from public.document_chunks dc
    join public.documents d on d.id = dc.document_id
    where
      (doc_id is null or dc.document_id = doc_id)
      and ((dc.user_id = requester and d.user_id = requester) or d.is_shared = true)
      and d.status = 'ready'
      and d.mime_type not in ('application/x-virtual-chat', 'application/x-all-docs')
      and dc.content_tsv @@ plainto_tsquery('simple', query_text)
    order by fts_rank desc
    limit fanout
  ),
  combined as (
    select
      coalesce(v.id, f.id) as id,
      coalesce(v.document_id, f.document_id) as document_id,
      coalesce(v.doc_title, f.doc_title) as doc_title,
      coalesce(v.content, f.content) as content,
      coalesce(v.metadata, f.metadata) as metadata,
      coalesce(v.similarity, 0)::float as similarity,
      (
        coalesce(1.0 / (rrf_k + v.rank), 0) +
        coalesce(1.0 / (rrf_k + f.rank), 0)
      )::float as rrf_score,
      (f.id is not null) as fts_hit
    from vector_hits v
    full outer join fts_hits f on v.id = f.id
  )
  select c.id, c.document_id, c.doc_title, c.content, c.metadata, c.similarity, c.rrf_score, c.fts_hit
  from combined c
  order by c.rrf_score desc, c.similarity desc
  limit match_count;
end;
$$;

-- Storage: documents bucket 및 정책
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_bucket_select_own" on storage.objects
  for select using (bucket_id = 'documents' and owner = auth.uid());

create policy "documents_bucket_insert_own" on storage.objects
  for insert with check (bucket_id = 'documents' and owner = auth.uid());

create policy "documents_bucket_delete_own" on storage.objects
  for delete using (bucket_id = 'documents' and owner = auth.uid());
