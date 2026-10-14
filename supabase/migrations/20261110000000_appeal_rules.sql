-- 소명 규칙을 기획(S-19 ⑥~⑧)에 맞춘다
--  · 조치 1건당 1번, 조치 후 30일 안에만 (조치 = 지금 걸린 임시 비공개 · 게시 중단)
--  · 증빙 파일 5개까지 (JPEG · PNG · WebP, 장당 10MB). 운영자만 열고, 처리 90일 뒤 지운다 (증거 보관 마이그레이션)
--  · 파일 저장 방식은 신고 증거와 같다: e/{토큰} → R2 evidence/{토큰}, 지우면 파일 정리 목록으로

create or replace function private.before_appeal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_at timestamptz;
begin
  select coalesce(p.removed_at, p.held_at) into action_at
  from public.posts p
  where p.id = new.post_id and p.author_id = new.author_id and (p.held_at is not null or p.removed_at is not null);
  if action_at is null then
    raise exception 'appeal_not_allowed' using errcode = 'P0001';
  end if;
  if now() > action_at + interval '30 days' then
    raise exception 'appeal_expired' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.appeals where post_id = new.post_id and created_at >= action_at) then
    raise exception 'appeal_limit' using errcode = 'P0001';
  end if;
  new.statement := btrim(new.statement);
  return new;
end;
$$;

-- 소명 최대 1,000자 (S-19 ⑥). 이미 있는 소명은 그대로 둔다.
alter table public.appeals add constraint appeal_statement_length check (char_length(statement) <= 1000) not valid;

create table public.appeal_evidence (
  id uuid primary key default gen_random_uuid(),
  appeal_id uuid not null references public.appeals (id) on delete cascade,
  storage_key text not null unique check (storage_key ~ '^e/[0-9a-f]{32}$'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes between 1 and 10 * 1024 * 1024),
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);
create index appeal_evidence_appeal_idx on public.appeal_evidence (appeal_id);

alter table public.appeal_evidence enable row level security;
revoke all on public.appeal_evidence from public, anon, authenticated;
grant select on public.appeal_evidence to authenticated;
create policy "내 소명의 증빙과 운영자" on public.appeal_evidence
  for select to authenticated
  using (
    exists (select 1 from public.appeals a where a.id = appeal_id and a.author_id = (select auth.uid()))
    or (select private.is_admin())
  );

create function public.add_appeal_evidence(target uuid, content_type text, bytes integer)
returns table (id uuid, storage_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.appeals a where a.id = target and a.author_id = (select auth.uid()) and a.status = 'open'
  ) then
    raise exception 'appeal_not_found' using errcode = '42501';
  end if;
  if content_type is null or content_type not in ('image/jpeg', 'image/png', 'image/webp')
     or bytes is null or bytes not between 1 and 10 * 1024 * 1024 then
    raise exception 'evidence_invalid' using errcode = 'P0001';
  end if;
  perform 1 from public.appeals a where a.id = target for update;
  if (select count(*) from public.appeal_evidence e where e.appeal_id = target) >= 5 then
    raise exception 'evidence_limit' using errcode = 'P0001';
  end if;
  return query
    insert into public.appeal_evidence as e (appeal_id, storage_key, content_type, bytes)
    values (target, 'e/' || replace(gen_random_uuid()::text, '-', ''), add_appeal_evidence.content_type, add_appeal_evidence.bytes)
    returning e.id, e.storage_key;
end;
$$;

create function public.finish_appeal_evidence(target uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.appeal_evidence e set uploaded_at = now()
  where e.id = target and e.uploaded_at is null
    and exists (select 1 from public.appeals a where a.id = e.appeal_id and a.author_id = (select auth.uid()));
  return found;
end;
$$;

revoke all on function public.add_appeal_evidence(uuid, text, integer), public.finish_appeal_evidence(uuid)
  from public, anon, authenticated;
grant execute on function public.add_appeal_evidence(uuid, text, integer), public.finish_appeal_evidence(uuid) to authenticated;

create trigger appeal_evidence_queue_storage_trash
after delete on public.appeal_evidence
referencing old table as old_rows
for each statement execute function private.queue_storage_trash();

-- 파일 정리: 아직 쓰이는 키(사진 · 신고 증거 · 소명 증빙)는 빼고
create or replace function private.storage_trash_due(grace interval default interval '7 days', max_rows integer default 200)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.storage_trash t
  where exists (select 1 from public.photos p where p.storage_key = t.storage_key)
     or exists (select 1 from public.report_evidence e where e.storage_key = t.storage_key)
     or exists (select 1 from public.appeal_evidence e where e.storage_key = t.storage_key);

  return query
    select t.storage_key from private.storage_trash t
    where t.queued_at < now() - grace
    order by t.queued_at
    limit least(greatest(max_rows, 1), 1000);
end;
$$;

-- 올리다 그만둔 증빙도 하루 뒤 지운다
create or replace function private.purge_stale_evidence(age interval default interval '1 day')
returns integer
language sql
security definer
set search_path = ''
as $$
  with a as (
    delete from public.report_evidence where uploaded_at is null and created_at < now() - age returning 1
  ), b as (
    delete from public.appeal_evidence where uploaded_at is null and created_at < now() - age returning 1
  )
  select ((select count(*) from a) + (select count(*) from b))::integer;
$$;
