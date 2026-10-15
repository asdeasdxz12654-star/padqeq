-- 운영 도구 2 (A-05 ③ · A-04)
--  · 한도 값 (A-05 ③): 코드 수정 없이 운영자가 바꾼다. 범위 안에서만, 사유 필수, 바꾼 기록은 감사 로그.
--      report_daily          하루 신고 (게시물 + 댓글 합산)        기본 20
--      auto_hold_reporters   자동 임시 비공개 신고자 수 (게시물 · 댓글) 기본 3
--      comment_hourly        한 시간 댓글                        기본 30
--      new_account_link_days 가입 후 링크 금지 기간(일)            기본 7
--      monthly_upload_photos 회원별 한 달(한국 시간) 사진 올리기    기본 300 (운영자 제외, 새 규칙)
--  · 허위 신고 이력 (A-04): 신고자별 접수 · 조치 · 기각 건수. 최근 180일 기각 5건 이상이고 처리된 신고의 80% 이상이
--    기각이면 '신뢰 낮음'. 이런 신고자는 자동 임시 비공개 인원 수에 세지 않는다 (미성년자 신고는 그대로 즉시).
--  · 불법 촬영물 격리 (A-04): 휴지통에 넣고(아무도 못 봄) 같은 사진 다시 올리기를 막고, 자동 영구 삭제 · 복구 · 영구 삭제를
--    모두 막아 원본을 보존한다. 격리를 풀어야 다른 조치를 할 수 있다.

-- ─────────────────────────────────────────────
-- 한도 값
-- ─────────────────────────────────────────────
create table public.site_limits (
  key text primary key,
  value integer not null,
  min_value integer not null,
  max_value integer not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (value between min_value and max_value)
);
alter table public.site_limits enable row level security;
revoke all on public.site_limits from public, anon, authenticated;
grant select on public.site_limits to authenticated;
create policy "운영자가 본다" on public.site_limits for select to authenticated using ((select private.is_admin()));

insert into public.site_limits (key, value, min_value, max_value) values
  ('report_daily', 20, 1, 200),
  ('auto_hold_reporters', 3, 2, 20),
  ('comment_hourly', 30, 1, 500),
  ('new_account_link_days', 7, 0, 90),
  ('monthly_upload_photos', 300, 1, 10000);

create function private.limit_value(name text, fallback integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value from public.site_limits where key = name), fallback);
$$;
revoke all on function private.limit_value(text, integer) from public, anon, authenticated;

create function public.set_site_limit(name text, new_value integer, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_ public.site_limits%rowtype;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  select * into row_ from public.site_limits where key = name for update;
  if not found then
    raise exception 'limit_not_found' using errcode = 'P0001';
  end if;
  if new_value is null or new_value not between row_.min_value and row_.max_value then
    raise exception 'limit_out_of_range' using errcode = 'P0001';
  end if;
  if new_value = row_.value then
    raise exception 'no_change' using errcode = 'P0001';
  end if;
  update public.site_limits set value = new_value, updated_by = (select auth.uid()), updated_at = now() where key = name;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'site_limit', 'site_limits', null,
          jsonb_build_object('key', name, 'from', row_.value, 'to', new_value, 'note', btrim(note)));
end;
$$;
revoke all on function public.set_site_limit(text, integer, text) from public, anon, authenticated;
grant execute on function public.set_site_limit(text, integer, text) to authenticated;

-- 신고 한도 (게시물 · 댓글 합산)
create or replace function private.before_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     + (select count(*) from public.comment_reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     >= private.limit_value('report_daily', 20) then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.before_comment_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     + (select count(*) from public.comment_reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     >= private.limit_value('report_daily', 20) then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────
-- 허위 신고 이력
-- ─────────────────────────────────────────────
create function private.reporter_unreliable(reporter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select status from public.reports where reporter_id = reporter and created_at > now() - interval '180 days' and status <> 'open'
    union all
    select status from public.comment_reports
    where reporter_id = reporter and created_at > now() - interval '180 days' and status <> 'open'
  )
  select count(*) filter (where status = 'dismissed') >= 5
     and count(*) filter (where status = 'dismissed') >= 0.8 * count(*)
  from r;
$$;
revoke all on function private.reporter_unreliable(uuid) from public, anon, authenticated;

-- 자동 임시 비공개: 신뢰 낮은 신고자는 인원 수에서 뺀다
create or replace function private.after_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
  hold text;
begin
  select count(distinct reporter_id) into reporters
  from public.reports where post_id = new.post_id and status = 'open' and not private.reporter_unreliable(reporter_id);

  if new.reason::text = 'minor_safety' then
    hold := 'auto:minor_safety';
  elsif reporters >= private.limit_value('auto_hold_reporters', 3) then
    hold := 'auto:multiple_reports';
  end if;

  if hold is not null then
    update public.posts set held_at = now(), held_reason = hold
    where id = new.post_id and held_at is null;
    if found then
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (null, 'auto_hold', 'posts', new.post_id, jsonb_build_object('reason', hold, 'reporters', reporters));
    end if;
  end if;
  return null;
end;
$$;

create or replace function private.after_comment_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
begin
  select count(distinct reporter_id) into reporters
  from public.comment_reports where comment_id = new.comment_id and status = 'open' and not private.reporter_unreliable(reporter_id);
  if new.reason::text = 'minor_safety' or reporters >= private.limit_value('auto_hold_reporters', 3) then
    update public.comments set hidden_at = now(), pinned = false where id = new.comment_id and hidden_at is null;
    if found then
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (null, 'auto_hide', 'comments', new.comment_id, jsonb_build_object('reason', new.reason, 'reporters', reporters));
    end if;
  end if;
  return null;
end;
$$;

-- 신고자 이력 (운영자 화면용): 게시물 · 댓글 신고 합산
create function public.admin_reporter_stats(ids uuid[])
returns table (reporter_id uuid, total integer, actioned integer, dismissed integer, unreliable boolean)
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
    with r as (
      select x.reporter_id, x.status::text as status from public.reports x where x.reporter_id = any (ids)
      union all
      select c.reporter_id, c.status::text from public.comment_reports c where c.reporter_id = any (ids)
    )
    select r.reporter_id, count(*)::integer, (count(*) filter (where r.status = 'actioned'))::integer,
           (count(*) filter (where r.status = 'dismissed'))::integer, private.reporter_unreliable(r.reporter_id)
    from r group by r.reporter_id;
end;
$$;
revoke all on function public.admin_reporter_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_reporter_stats(uuid[]) to authenticated;

-- ─────────────────────────────────────────────
-- 댓글 한도 · 링크 금지 기간
-- ─────────────────────────────────────────────
create or replace function private.before_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.comments%rowtype;
begin
  new.body := btrim(new.body);
  if char_length(new.body) = 0 then
    raise exception 'comment_empty' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    return new;
  end if;

  -- 답글은 같은 글의 원댓글에만 (1단계)
  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if parent.id is null or parent.post_id <> new.post_id or parent.parent_id is not null then
      raise exception 'parent_invalid' using errcode = 'P0001';
    end if;
  end if;

  if (select count(*) from public.comments where author_id = new.author_id and created_at > now() - interval '1 hour')
     >= private.limit_value('comment_hourly', 30) then
    raise exception 'comment_rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.comments where post_id = new.post_id) >= 2000 then
    raise exception 'comment_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.check_text(author uuid, value text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if author is null or exists (select 1 from public.profiles where id = author and role = 'admin') then
    return;
  end if;
  if exists (select 1 from public.banned_words w where position(private.squash(w.word) in private.squash(value)) > 0) then
    raise exception 'banned_word' using errcode = 'P0001';
  end if;
  if private.has_link(value)
     and (select created_at from public.profiles where id = author)
         > now() - make_interval(days => private.limit_value('new_account_link_days', 7)) then
    raise exception 'links_not_allowed' using errcode = 'P0001';
  end if;
end;
$$;

-- ─────────────────────────────────────────────
-- 회원별 한 달 업로드 (운영자 제외)
-- ─────────────────────────────────────────────
create function private.before_photo_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  select author_id into author from public.posts where id = new.post_id;
  if author is null or (select auth.uid()) is null
     or exists (select 1 from public.profiles where id = author and role = 'admin') then
    return new;
  end if;
  if (select count(*) from public.photos ph join public.posts p on p.id = ph.post_id
      where p.author_id = author and ph.created_at >= month_start) >= private.limit_value('monthly_upload_photos', 300) then
    raise exception 'monthly_upload_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.before_photo_quota() from public, anon, authenticated;
create trigger photos_monthly_quota before insert on public.photos
  for each row execute function private.before_photo_quota();

-- 이번 달 남은 업로드 (업로드 화면 안내용, 본인)
create function public.my_upload_quota()
returns table (used integer, quota integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::integer from public.photos ph join public.posts p on p.id = ph.post_id
          where p.author_id = (select auth.uid())
            and ph.created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
         private.limit_value('monthly_upload_photos', 300);
$$;
revoke all on function public.my_upload_quota() from public, anon, authenticated;
grant execute on function public.my_upload_quota() to authenticated;

-- ─────────────────────────────────────────────
-- 불법 촬영물 격리
-- ─────────────────────────────────────────────
alter table public.posts add column quarantined_at timestamptz;

create or replace function public.admin_posts_action(targets uuid[], action text, note text)
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
  if action not in ('hide', 'restore', 'trash', 'untrash', 'purge', 'quarantine', 'unquarantine') then
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
    elsif action in ('trash', 'quarantine') then
      continue when row_.quarantined_at is not null or (action = 'trash' and row_.trashed_at is not null);
      if row_.trashed_at is null then
        update public.posts
        set trashed_at = now(), trash_prev_status = row_.status, trash_prev_removed_at = row_.removed_at,
            status = case when row_.status = 'published' then 'hidden'::public.post_status else row_.status end
        where id = t;
      end if;
      if action = 'quarantine' then
        -- 같은 사진 다시 올리기 막기(removed_at → 차단 해시) · 원본 보존
        update public.posts set quarantined_at = now(), removed_at = coalesce(removed_at, now()), held_at = null, held_reason = null
        where id = t;
        update public.appeals set status = 'rejected', resolved_at = now() where post_id = t and status = 'open';
      end if;
      update public.reports set status = 'actioned', resolved_at = now() where post_id = t and status = 'open';
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (me, 'post_' || action, 'posts', t, jsonb_build_object('note', btrim(note), 'title', row_.title, 'from', row_.status));
    elsif action = 'unquarantine' then
      continue when row_.quarantined_at is null;
      -- 휴지통에 남고, 30일은 지금부터 다시 센다
      update public.posts set quarantined_at = null, trashed_at = now() where id = t;
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (me, 'post_unquarantine', 'posts', t, jsonb_build_object('note', btrim(note), 'title', row_.title));
    elsif action = 'untrash' then
      continue when row_.trashed_at is null or row_.quarantined_at is not null;
      update public.posts
      set status = coalesce(row_.trash_prev_status, row_.status), removed_at = row_.trash_prev_removed_at,
          trashed_at = null, trash_prev_status = null, trash_prev_removed_at = null
      where id = t;
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (me, 'post_untrash', 'posts', t, jsonb_build_object('note', btrim(note), 'title', row_.title));
    else
      continue when row_.trashed_at is null or row_.quarantined_at is not null;
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

-- 격리한 글은 30일이 지나도 지우지 않는다
create or replace function private.purge_trashed_posts(age interval default interval '30 days')
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
  from public.posts where trashed_at <= now() - age and quarantined_at is null;
  with gone as (delete from public.posts where trashed_at <= now() - age and quarantined_at is null returning 1)
  select count(*)::integer into n from gone;
  return n;
end;
$$;

-- 작성자 탈퇴 · 직접 지우기로도 격리 글은 지워지지 않는다 (원본 보존)
create function private.guard_quarantined_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.quarantined_at is not null then
    raise exception 'post_quarantined' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function private.guard_quarantined_delete() from public, anon, authenticated;
create trigger posts_guard_quarantined before delete on public.posts
  for each row execute function private.guard_quarantined_delete();
