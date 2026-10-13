-- 소명 (이의 제기)
--  · 임시 비공개 · 운영자 게시 중단된 글의 작성자가 사유를 적어 다시 검토를 요청한다
--  · 한 번에 하나, 게시물당 최대 3번
--  · 처리는 moderate_post()로: 풀어 주면(release · restore · dismiss) 받아들임, 유지하면(hold · hide) 거절
--  · 운영자가 게시 중단한 글은 작성자가 스스로 다시 게시할 수 없다 (removed_at)

alter type public.notification_kind add value if not exists 'post_restored';
alter type public.notification_kind add value if not exists 'appeal_rejected';

alter table public.posts add column removed_at timestamptz;
-- 이미 운영자가 게시 중단한 글 (감사 로그 기준)
update public.posts p set removed_at = l.created_at
from (
  select distinct on (target_id) target_id, created_at, detail->>'decision' as decision
  from private.audit_log where action = 'moderation' order by target_id, created_at desc
) l
where l.target_id = p.id and l.decision = 'hide' and p.status = 'hidden';

create function private.guard_removed_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.removed_at is not null and new.status is distinct from old.status and not private.is_admin() then
    raise exception 'post_removed_by_moderator' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger posts_guard_removed
before update of status on public.posts
for each row execute function private.guard_removed_post();

create type public.appeal_status as enum ('open', 'accepted', 'rejected');

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  statement text not null check (char_length(btrim(statement)) between 10 and 2000),
  status public.appeal_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index appeals_one_open_per_post on public.appeals (post_id) where status = 'open';
create index appeals_open_idx on public.appeals (created_at) where status = 'open';

alter table public.appeals enable row level security;
revoke all on public.appeals from public, anon, authenticated;
grant select on public.appeals to authenticated;
grant insert (post_id, author_id, statement) on public.appeals to authenticated;

create policy "내 소명과 운영자" on public.appeals
  for select to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));
create policy "조치된 내 글에 소명한다" on public.appeals
  for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_post_author(post_id));

create function private.before_appeal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.posts
    where id = new.post_id and author_id = new.author_id and (held_at is not null or removed_at is not null)
  ) then
    raise exception 'appeal_not_allowed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.appeals where post_id = new.post_id) >= 3 then
    raise exception 'appeal_limit' using errcode = 'P0001';
  end if;
  new.statement := btrim(new.statement);
  return new;
end;
$$;
create trigger appeals_rules
before insert on public.appeals
for each row execute function private.before_appeal();

create function private.notify_appeal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 받아들인 경우는 게시물 알림(post_released · post_restored)이 대신한다
  if old.status = 'open' and new.status = 'rejected' then
    perform private.notify(new.author_id, 'appeal_rejected'::public.notification_kind, null, new.post_id);
  end if;
  return null;
end;
$$;
create trigger appeals_notify
after update of status on public.appeals
for each row execute function private.notify_appeal();

-- 게시물 알림에 '다시 게시됨' 추가
create or replace function private.notify_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if old.status = 'draft' and new.status = 'published' then
    for c in select member_id from public.credits where post_id = new.id and status = 'pending' and member_id is not null loop
      perform private.notify(c.member_id, 'credit_requested', new.author_id, new.id);
    end loop;
  end if;

  if old.held_at is null and new.held_at is not null then
    perform private.notify(new.author_id, 'post_held', null, new.id);
  elsif old.held_at is not null and new.held_at is null and new.status = 'published' then
    perform private.notify(new.author_id, 'post_released', null, new.id);
  end if;

  if old.status = 'published' and new.status = 'hidden' then
    perform private.notify(new.author_id, 'post_hidden', null, new.id);
  elsif old.status = 'hidden' and new.status = 'published' and old.removed_at is not null then
    perform private.notify(new.author_id, 'post_restored'::public.notification_kind, null, new.id);
  end if;
  return null;
end;
$$;

-- 운영자 조치: restore(게시 중단 해제) 추가, 소명 처리
create or replace function public.moderate_post(target uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_count integer;
  post_row public.posts%rowtype;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if decision not in ('dismiss', 'hold', 'hide', 'release', 'restore') then
    raise exception 'decision_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.posts where id = target) then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;

  select count(*) into open_count from public.reports where post_id = target and status = 'open';

  if decision = 'dismiss' then
    update public.reports set status = 'dismissed', resolved_at = now() where post_id = target and status = 'open';
    update public.posts set held_at = null, held_reason = null where id = target and held_reason like 'auto:%';
  elsif decision = 'hold' then
    update public.posts set held_at = coalesce(held_at, now()), held_reason = 'admin' where id = target;
    update public.reports set status = 'actioned', resolved_at = now() where post_id = target and status = 'open';
  elsif decision = 'hide' then
    update public.posts set status = 'hidden', removed_at = coalesce(removed_at, now()), held_at = null, held_reason = null
    where id = target;
    update public.reports set status = 'actioned', resolved_at = now() where post_id = target and status = 'open';
  elsif decision = 'release' then
    update public.posts set held_at = null, held_reason = null where id = target;
  else
    if not exists (select 1 from public.posts where id = target and removed_at is not null) then
      raise exception 'not_removed' using errcode = 'P0001';
    end if;
    update public.posts set status = 'published', removed_at = null, held_at = null, held_reason = null where id = target;
  end if;

  -- 소명: 글이 다시 보이게 됐으면 받아들임, 조치를 유지했으면 거절
  select * into post_row from public.posts where id = target;
  if post_row.status = 'published' and post_row.held_at is null then
    update public.appeals set status = 'accepted', resolved_at = now() where post_id = target and status = 'open';
  elsif decision in ('hold', 'hide') then
    update public.appeals set status = 'rejected', resolved_at = now() where post_id = target and status = 'open';
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'moderation', 'posts', target,
          jsonb_build_object('decision', decision, 'note', btrim(note), 'open_reports', open_count));
end;
$$;

revoke all on function private.guard_removed_post(), private.before_appeal(), private.notify_appeal()
  from public, anon, authenticated;
