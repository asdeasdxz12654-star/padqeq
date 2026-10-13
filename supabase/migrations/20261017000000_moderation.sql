-- 신고 (S-15) · 신고 처리 (A-04)
--  · 사유 추가: 도촬 · 딥페이크 (P-02)
--  · 임시 비공개(held): 미성년자 신고는 접수 즉시, 서로 다른 3명 신고 시 자동. 작성자 · 운영자에게만 보인다.
--  · 신고 남용 방지: 같은 글 중복 신고 금지, 하루 20건, 내 글 · 볼 수 없는 글 신고 금지
--  · 운영자 조치는 moderate_post() 한 곳에서, 내부 사유 필수 · 감사 로그

-- 새 enum 값은 같은 트랜잭션에서 쓸 수 없으므로 아래에서는 text로 비교한다
alter type public.report_reason add value if not exists 'voyeurism';
alter type public.report_reason add value if not exists 'deepfake';

alter table public.posts
  add column held_at timestamptz,
  add column held_reason text check (held_reason is null or char_length(held_reason) <= 60);

alter table public.reports
  add column photo_position smallint check (photo_position is null or photo_position between 0 and 19);
create unique index reports_one_open_per_reporter on public.reports (reporter_id, post_id) where status = 'open';
create index reports_reporter_recent_idx on public.reports (reporter_id, created_at desc);

-- 공개 범위: 게시됨 + 임시 비공개 아님. 작성자 · 운영자는 그대로 본다.
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
      and ((p.status = 'published' and p.held_at is null)
           or p.author_id = (select auth.uid())
           or private.is_admin())
  );
$$;

drop policy "게시된 글 · 내 글 · 운영자" on public.posts;
create policy "게시된 글 · 내 글 · 운영자" on public.posts
  for select to anon, authenticated
  using (
    (status = 'published' and held_at is null)
    or author_id = (select auth.uid())
    or (select private.is_admin())
  );

-- 임시 비공개는 운영자 함수 · 신고 트리거만 바꾼다 (회원은 열 권한 없음)
revoke update on public.posts from authenticated;
grant update (title, body, category, status, shot_year, shot_on, has_people) on public.posts to authenticated;

-- 신고 넣기: 볼 수 있는 남의 글만, 정해진 열만
drop policy "회원은 신고할 수 있다" on public.reports;
create policy "볼 수 있는 남의 글을 신고한다" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and private.post_is_visible(post_id)
    and not private.is_post_author(post_id)
  );
revoke insert on public.reports from authenticated;
grant insert (reporter_id, post_id, reason, detail, photo_position) on public.reports to authenticated;
-- 처리는 moderate_post()로만
revoke update on public.reports from authenticated;
drop policy "운영자가 신고를 처리한다" on public.reports;

create function private.before_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.reports
      where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger reports_rate_limit
before insert on public.reports
for each row execute function private.before_report();

create function private.after_report()
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
  from public.reports where post_id = new.post_id and status = 'open';

  if new.reason::text = 'minor_safety' then
    hold := 'auto:minor_safety';
  elsif reporters >= 3 then
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
create trigger reports_auto_hold
after insert on public.reports
for each row execute function private.after_report();

-- 운영자 조치
--  dismiss: 신고 기각(+ 자동 임시 비공개 해제) · hold: 임시조치(소명 대기) · hide: 게시 중단 · release: 임시조치 해제
create function public.moderate_post(target uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_count integer;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if decision not in ('dismiss', 'hold', 'hide', 'release') then
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
    update public.posts set status = 'hidden', held_at = null, held_reason = null where id = target;
    update public.reports set status = 'actioned', resolved_at = now() where post_id = target and status = 'open';
  else
    update public.posts set held_at = null, held_reason = null where id = target;
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'moderation', 'posts', target,
          jsonb_build_object('decision', decision, 'note', btrim(note), 'open_reports', open_count));
end;
$$;

revoke all on function private.before_report(), private.after_report() from public, anon, authenticated;
revoke all on function public.moderate_post(uuid, text, text) from public, anon, authenticated;
grant execute on function public.moderate_post(uuid, text, text) to authenticated;
