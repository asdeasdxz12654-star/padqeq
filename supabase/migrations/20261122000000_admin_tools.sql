-- 운영 도구 (A-01 · A-03 · A-05)
--  · 휴지통 (A-03): 운영자 삭제는 휴지통으로. 30일 안에 복구, 지나면 매일 정리 작업이 영구 삭제(사진 파일은 저장소 정리 대기열로).
--    휴지통 글은 작성자를 포함해 운영자 말고는 아무도 못 보고, 작성자가 고칠 수도 없다. 복구하면 넣기 전 상태로 돌아간다.
--  · 일괄 작업 (A-03 ③): 게시 중단 · 중단 해제 · 휴지통 · 복구 · 영구 삭제. 한 번에 100개까지, 사유 필수, 글마다 감사 로그.
--  · 대시보드 (A-01): 오늘 가입 · 업로드 · 대기 건수 · 최우선 신고 · 저장 용량 · 할 일
--  · 감사 로그 (A-05): 운영자만 검색해서 본다. 고칠 수 없고, 3년 지난 기록만 정리 작업이 지운다.
--  · 경고 (A-05 ⑥): 제재 단계 경고 → 업로드 회수 → 기간 정지 → 무기한 정지. 경고는 본인에게 사유와 함께 남는다.
--  · 회원 개인정보 (A-05 ④): 이메일은 가려서 보여 주고, 원문은 사유를 적어야 보이며 감사 로그에 남는다.

alter type public.notification_kind add value if not exists 'member_warned';

-- ─────────────────────────────────────────────
-- 휴지통
-- ─────────────────────────────────────────────
alter table public.posts
  add column trashed_at timestamptz,
  add column trash_prev_status public.post_status,
  add column trash_prev_removed_at timestamptz;
create index posts_trashed_idx on public.posts (trashed_at) where trashed_at is not null;

create or replace function private.post_is_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = target
      and ((p.trashed_at is null
            and ((p.status = 'published' and p.held_at is null and private.author_active(p.author_id)
                  and not private.blocked_with_me(p.author_id) and private.audience_ok(p.author_id, p.visibility, p.scheduled_at))
                 or p.author_id = (select auth.uid())))
           or private.is_admin())
  );
$$;

drop policy "게시된 글 · 내 글 · 운영자" on public.posts;
create policy "게시된 글 · 내 글 · 운영자" on public.posts
  for select to anon, authenticated
  using (
    (trashed_at is null
     and ((status = 'published' and held_at is null and private.author_active(author_id)
           and not private.blocked_with_me(author_id) and private.audience_ok(author_id, visibility, scheduled_at))
          or author_id = (select auth.uid())))
    or (select private.is_admin())
  );

-- 휴지통 글은 운영자만 바꾼다 (작성자의 지우기는 그대로 둔다)
create function private.guard_trashed_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.trashed_at is not null and not private.is_admin() then
    raise exception 'post_trashed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_trashed_post() from public, anon, authenticated;
create trigger posts_guard_trashed before update on public.posts
  for each row execute function private.guard_trashed_post();

-- 일괄 작업
--  hide: 게시 중단 · restore: 게시 중단 해제 (moderate_post와 같은 규칙) · trash: 휴지통 · untrash: 복구 · purge: 영구 삭제(휴지통 글만)
create function public.admin_posts_action(targets uuid[], action text, note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t uuid;
  done integer := 0;
  row_ public.posts%rowtype;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if action not in ('hide', 'restore', 'trash', 'untrash', 'purge') then
    raise exception 'action_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if targets is null or cardinality(targets) not between 1 and 100 then
    raise exception 'targets_invalid' using errcode = 'P0001';
  end if;

  foreach t in array (select array_agg(distinct x) from unnest(targets) x) loop
    select * into row_ from public.posts where id = t for update;
    continue when not found;

    if action = 'hide' then
      continue when row_.trashed_at is not null or row_.status <> 'published';
      perform public.moderate_post(t, 'hide', note);
    elsif action = 'restore' then
      continue when row_.trashed_at is not null or row_.removed_at is null;
      perform public.moderate_post(t, 'restore', note);
    elsif action = 'trash' then
      continue when row_.trashed_at is not null;
      update public.posts
      set trashed_at = now(), trash_prev_status = row_.status, trash_prev_removed_at = row_.removed_at,
          status = case when row_.status = 'published' then 'hidden'::public.post_status else row_.status end
      where id = t;
      update public.reports set status = 'actioned', resolved_at = now() where post_id = t and status = 'open';
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (me, 'post_trash', 'posts', t, jsonb_build_object('note', btrim(note), 'title', row_.title, 'from', row_.status));
    elsif action = 'untrash' then
      continue when row_.trashed_at is null;
      update public.posts
      set status = coalesce(row_.trash_prev_status, row_.status), removed_at = row_.trash_prev_removed_at,
          trashed_at = null, trash_prev_status = null, trash_prev_removed_at = null
      where id = t;
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (me, 'post_untrash', 'posts', t, jsonb_build_object('note', btrim(note), 'title', row_.title));
    else
      continue when row_.trashed_at is null;
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (me, 'post_purge', 'posts', t,
              jsonb_build_object('note', btrim(note), 'title', row_.title, 'author_id', row_.author_id));
      delete from public.posts where id = t;
    end if;
    done := done + 1;
  end loop;
  return done;
end;
$$;
revoke all on function public.admin_posts_action(uuid[], text, text) from public, anon, authenticated;
grant execute on function public.admin_posts_action(uuid[], text, text) to authenticated;

-- 30일 지난 휴지통 비우기 (매일 정리 작업, DB 관리자 연결 전용)
create function private.purge_trashed_posts(age interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  select null, 'post_purge', 'posts', id, jsonb_build_object('note', 'auto:trash_30d', 'title', title, 'author_id', author_id)
  from public.posts where trashed_at <= now() - age;
  with gone as (delete from public.posts where trashed_at <= now() - age returning 1)
  select count(*)::integer into n from gone;
  return n;
end;
$$;
revoke all on function private.purge_trashed_posts(interval) from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- 대시보드
-- ─────────────────────────────────────────────
create function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today_start timestamptz := ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul';
  tomorrow date := (now() at time zone 'Asia/Seoul')::date + 1;
  result jsonb;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'signups_today', (select count(*) from public.profiles where created_at >= today_start),
    'photos_today', (select count(*) from public.photos where created_at >= today_start),
    'published_today', (select count(*) from public.posts where published_at >= today_start and status = 'published'),
    'members', (select count(*) from public.profiles),
    'uploaders', (select count(*) from public.profiles where can_upload),
    'published', (select count(*) from public.posts where status = 'published' and trashed_at is null),
    'scheduled', (select count(*) from public.posts where status = 'published' and scheduled_at > now()),
    'trash', (select count(*) from public.posts where trashed_at is not null),
    'photo_bytes', (select coalesce(sum(bytes), 0) from public.photos),
    'suspended', (select count(*) from public.member_restrictions where suspended_until > now()),
    'urgent_reports', (select count(*) from public.reports
                       where status = 'open' and reason::text in ('minor_safety', 'portrait_rights', 'voyeurism', 'deepfake')),
    'oldest_urgent_at', (select min(created_at) from public.reports
                         where status = 'open' and reason::text in ('minor_safety', 'portrait_rights', 'voyeurism', 'deepfake')),
    'tomorrow_pick_empty', not exists (select 1 from public.daily_picks where pick_date = tomorrow),
    'trash_due_week', (select count(*) from public.posts where trashed_at <= now() - interval '23 days')
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_dashboard() from public, anon, authenticated;
grant execute on function public.admin_dashboard() to authenticated;

-- ─────────────────────────────────────────────
-- 감사 로그
-- ─────────────────────────────────────────────
create function private.guard_audit_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' or old.created_at > now() - interval '3 years' then
    raise exception 'audit_log_immutable' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function private.guard_audit_log() from public, anon, authenticated;
create trigger audit_log_immutable before update or delete on private.audit_log
  for each row execute function private.guard_audit_log();

-- 검색: 행동 이름 · 대상 id · 처리한 운영자 핸들. before_id보다 오래된 것부터 max_rows개.
create function public.admin_audit_log(q text default null, before_id bigint default null, max_rows integer default 50)
returns table (id bigint, action text, target_table text, target_id uuid, detail jsonb, actor_handle text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  needle text := nullif(btrim(coalesce(q, '')), '');
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
    select a.id, a.action, a.target_table, a.target_id, a.detail, p.handle::text, a.created_at
    from private.audit_log a
    left join public.profiles p on p.id = a.actor_id
    where (before_id is null or a.id < before_id)
      and (needle is null
           or a.action = needle
           or a.target_id::text = needle
           or p.handle::text = ltrim(needle, '@'))
    order by a.id desc
    limit least(greatest(coalesce(max_rows, 50), 1), 200);
end;
$$;
revoke all on function public.admin_audit_log(text, bigint, integer) from public, anon, authenticated;
grant execute on function public.admin_audit_log(text, bigint, integer) to authenticated;

-- ─────────────────────────────────────────────
-- 경고
-- ─────────────────────────────────────────────
create table public.member_warnings (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index member_warnings_member_idx on public.member_warnings (member_id, created_at desc);
alter table public.member_warnings enable row level security;
revoke all on public.member_warnings from public, anon, authenticated;
grant select on public.member_warnings to authenticated;
create policy "내 경고와 운영자" on public.member_warnings for select to authenticated
  using (member_id = (select auth.uid()) or (select private.is_admin()));

create or replace function public.sanction_member(target uuid, action text, note text, days integer default null, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target_role public.member_role;
  ends timestamptz;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if action not in ('warn', 'suspend', 'lift', 'revoke_upload', 'grant_upload') then
    raise exception 'action_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  select role into target_role from public.profiles where id = target for update;
  if target_role is null then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if target_role = 'admin' then
    raise exception 'target_admin' using errcode = 'P0001';
  end if;
  if action in ('warn', 'suspend') and (reason is null or char_length(btrim(reason)) not between 1 and 200) then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  if action = 'warn' then
    insert into public.member_warnings (member_id, reason, created_by) values (target, btrim(reason), me);
    perform private.notify(target, 'member_warned'::text::public.notification_kind, null, null);
  elsif action = 'suspend' then
    if days is null or days not between 1 and 3650 then
      raise exception 'days_invalid' using errcode = 'P0001';
    end if;
    ends := now() + make_interval(days => days);
    insert into public.member_restrictions (member_id, suspended_until, reason, created_by)
    values (target, ends, btrim(reason), me)
    on conflict (member_id) do update
      set suspended_until = excluded.suspended_until, reason = excluded.reason,
          created_by = excluded.created_by, created_at = now();
    perform private.notify(target, 'member_suspended', null, null);
  elsif action = 'lift' then
    delete from public.member_restrictions where member_id = target and suspended_until > now();
    if not found then
      raise exception 'not_suspended' using errcode = 'P0001';
    end if;
    perform private.notify(target, 'suspension_lifted', null, null);
  else
    update public.profiles set can_upload = (action = 'grant_upload')
    where id = target and can_upload is distinct from (action = 'grant_upload');
    if not found then
      raise exception 'no_change' using errcode = 'P0001';
    end if;
    perform private.notify(target,
      case action when 'grant_upload' then 'upload_granted' else 'upload_revoked' end::public.notification_kind,
      null, null);
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values (me, 'sanction', 'profiles', target,
          jsonb_strip_nulls(jsonb_build_object('action', action, 'note', btrim(note), 'days', days,
            'until', ends, 'reason', btrim(reason))));
end;
$$;

-- ─────────────────────────────────────────────
-- 회원 개인정보: 가린 값 · 원문(사유 + 감사 로그)
-- ─────────────────────────────────────────────
create function private.mask_email(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when email is null or position('@' in email) = 0 then null
    else left(split_part(email, '@', 1), 1) || repeat('*', greatest(char_length(split_part(email, '@', 1)) - 1, 2))
         || '@' || left(split_part(email, '@', 2), 1)
         || repeat('*', greatest(char_length(split_part(split_part(email, '@', 2), '.', 1)) - 1, 2))
         || coalesce('.' || nullif(substring(split_part(email, '@', 2) from '\.(.*)$'), ''), '')
  end;
$$;
revoke all on function private.mask_email(text) from public, anon, authenticated;

create function public.admin_member_account(target uuid)
returns table (masked_email text, provider text, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
    select private.mask_email(u.email::text), (u.raw_app_meta_data ->> 'provider')::text, u.last_sign_in_at
    from auth.users u where u.id = target;
end;
$$;
revoke all on function public.admin_member_account(uuid) from public, anon, authenticated;
grant execute on function public.admin_member_account(uuid) to authenticated;

create function public.admin_reveal_email(target uuid, reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_email text;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if reason is null or char_length(btrim(reason)) not between 2 and 200 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select u.email::text into found_email from auth.users u where u.id = target;
  if found_email is null then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'pii_view', 'profiles', target, jsonb_build_object('field', 'email', 'reason', btrim(reason)));
  return found_email;
end;
$$;
revoke all on function public.admin_reveal_email(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_reveal_email(uuid, text) to authenticated;
