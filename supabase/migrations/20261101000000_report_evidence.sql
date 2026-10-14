-- 신고 증거 첨부 (S-15 ⑦): 신고 한 건에 사진 3장까지 (JPEG · PNG · WebP, 장당 10MB)
--  · 파일은 공개 주소 없는 R2의 evidence/{토큰}에 둔다. 신고자 본인과 운영자만 행을 보고, 파일은 운영자만 연다.
--  · 처리 대기 중인 내 신고에만 붙일 수 있다. 행을 먼저 만들고(add_report_evidence) 파일을 올린 뒤 완료 처리한다.
--  · 하루가 지나도 파일이 올라오지 않은 행은 매일 정리 작업이 지운다
--  · 신고가 지워지면(3년 보관 뒤 · 신고자 탈퇴) 증거도 지우고, 파일은 사진과 같은 정리 목록(storage_trash)으로 지운다
--    저장 키: 사진 p/{토큰} → display/{토큰}/*, 증거 e/{토큰} → evidence/{토큰}

create table public.report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  storage_key text not null unique check (storage_key ~ '^e/[0-9a-f]{32}$'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes between 1 and 10 * 1024 * 1024),
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);
create index report_evidence_report_idx on public.report_evidence (report_id);

alter table public.report_evidence enable row level security;
revoke all on public.report_evidence from public, anon, authenticated;
grant select on public.report_evidence to authenticated;
create policy "내 신고의 증거와 운영자" on public.report_evidence
  for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
    or (select private.is_admin())
  );

-- 증거 자리 만들기. 파일을 올릴 id · 저장 키를 돌려준다.
create function public.add_report_evidence(target uuid, content_type text, bytes integer)
returns table (id uuid, storage_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.reports r where r.id = target and r.reporter_id = me and r.status = 'open'
  ) then
    raise exception 'report_not_found' using errcode = '42501';
  end if;
  if private.is_suspended() then
    raise exception 'member_suspended' using errcode = '42501';
  end if;
  if content_type is null or content_type not in ('image/jpeg', 'image/png', 'image/webp')
     or bytes is null or bytes not between 1 and 10 * 1024 * 1024 then
    raise exception 'evidence_invalid' using errcode = 'P0001';
  end if;
  -- 같은 신고에 동시에 붙여도 3장을 넘지 않게
  perform 1 from public.reports r where r.id = target for update;
  if (select count(*) from public.report_evidence e where e.report_id = target) >= 3 then
    raise exception 'evidence_limit' using errcode = 'P0001';
  end if;

  return query
    insert into public.report_evidence as e (report_id, storage_key, content_type, bytes)
    values (target, 'e/' || replace(gen_random_uuid()::text, '-', ''), add_report_evidence.content_type, add_report_evidence.bytes)
    returning e.id, e.storage_key;
end;
$$;

-- 파일을 다 올렸다고 표시 (서버가 파일을 확인한 뒤 부른다)
create function public.finish_report_evidence(target uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.report_evidence e set uploaded_at = now()
  where e.id = target and e.uploaded_at is null
    and exists (select 1 from public.reports r where r.id = e.report_id and r.reporter_id = (select auth.uid()));
  return found;
end;
$$;

revoke all on function public.add_report_evidence(uuid, text, integer), public.finish_report_evidence(uuid)
  from public, anon, authenticated;
grant execute on function public.add_report_evidence(uuid, text, integer), public.finish_report_evidence(uuid)
  to authenticated;

-- 파일 정리 목록이 증거 키도 받도록
alter table private.storage_trash drop constraint storage_trash_storage_key_check;
alter table private.storage_trash add constraint storage_trash_storage_key_check
  check (storage_key ~ '^[pe]/[0-9a-f]{32}$');

create or replace function private.queue_storage_trash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.storage_trash (storage_key)
  select storage_key from old_rows
  where storage_key ~ '^[pe]/[0-9a-f]{32}$'
  on conflict (storage_key) do nothing;
  return null;
end;
$$;

create trigger report_evidence_queue_storage_trash
after delete on public.report_evidence
referencing old table as old_rows
for each statement execute function private.queue_storage_trash();

create or replace function private.storage_trash_due(grace interval default interval '7 days', max_rows integer default 200)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.storage_trash t
  where exists (select 1 from public.photos p where p.storage_key = t.storage_key)
     or exists (select 1 from public.report_evidence e where e.storage_key = t.storage_key);

  return query
    select t.storage_key from private.storage_trash t
    where t.queued_at < now() - grace
    order by t.queued_at
    limit least(greatest(max_rows, 1), 1000);
end;
$$;

-- 올리다 그만둔 증거 지우기 (매일 정리 작업, DB 관리자 연결 전용)
create function private.purge_stale_evidence(age interval default interval '1 day')
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.report_evidence where uploaded_at is null and created_at < now() - age returning 1
  )
  select count(*)::integer from gone;
$$;
revoke all on function private.purge_stale_evidence(interval) from public, anon, authenticated;
