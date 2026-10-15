-- 운영 도우미 (A-05 관리자 계정 · 역할)
--  · 역할: 최고 관리자(admin) · 운영 도우미(moderator) · 회원(member)
--  · 운영 도우미가 하는 일: 게시물 · 댓글 · 게시판 신고 처리(기각 · 임시 비공개 · 게시 중단 · 해제), 불법 촬영물 격리,
--    일반 회원에게 경고. 신고 화면을 보려고 가려진 글 · 댓글 · 신고 내역 · 이용 제한을 볼 수 있다 (휴지통은 제외).
--  · 최고 관리자만: 되살리기 · 휴지통 · 영구 삭제 · 격리 해제, 정지 · 업로드 회수 등 경고 밖의 제재, 소명 · 크레딧 요청,
--    대화 신고(개인 메시지 열람), 이메일 열람, 한도 · 설정 · 행사 · 태그, 감사 로그, 역할 지정
--  · 운영 도우미도 2단계 인증(aal2) 세션에서만 권한이 있다
--  · 역할 지정은 최고 관리자가 사유와 함께 (감사 로그). 최고 관리자는 DB 콘솔에서만 정한다.

alter type public.member_role add value if not exists 'moderator';

-- 최고 관리자 또는 운영 도우미 (2단계 인증 세션). 새 값은 같은 마이그레이션 안이라 글자로 비교한다.
create function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.profiles where id = (select auth.uid()) and role::text in ('admin', 'moderator'));
$$;
revoke all on function private.is_staff() from public, anon, authenticated;
grant execute on function private.is_staff() to anon, authenticated;

-- ─────────────────────────────────────────────
-- 보기: 신고 화면에 필요한 것 (휴지통 글은 최고 관리자만)
-- ─────────────────────────────────────────────
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
                 or p.author_id = (select auth.uid())
                 or private.is_staff()))
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
          or author_id = (select auth.uid())
          or (select private.is_staff())))
    or (select private.is_admin())
  );

drop policy "보이는 게시물의 다 올라간 사진만" on public.photos;
create policy "보이는 게시물의 다 올라간 사진만" on public.photos
  for select to anon, authenticated
  using (
    private.post_is_visible(post_id)
    and (ready_at is not null or private.is_post_author(post_id) or (select private.is_staff()))
  );

drop policy "볼 수 있는 글의 댓글" on public.comments;
create policy "볼 수 있는 글의 댓글" on public.comments for select to anon, authenticated
  using (
    private.post_is_visible(post_id)
    and private.author_active(author_id)
    and (author_id = (select auth.uid()) or (select private.is_staff()) or not private.blocked_with_me(author_id))
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_staff()))
  );

drop policy "게시판 글은 누구나 본다 (가린 글은 쓴 사람 · 운영자만)" on public.board_posts;
create policy "게시판 글은 누구나 본다 (가린 글은 쓴 사람 · 운영자만)" on public.board_posts for select to anon, authenticated
  using (
    private.author_active(author_id)
    and ((select private.is_staff()) or not private.blocked_with_me(author_id))
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_staff()))
  );

drop policy "보이는 글의 답글" on public.board_replies;
create policy "보이는 글의 답글" on public.board_replies for select to anon, authenticated
  using (
    private.board_post_is_visible(board_post_id)
    and private.author_active(author_id)
    and ((select private.is_staff()) or not private.blocked_with_me(author_id))
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_staff()))
  );

drop policy "내 신고와 운영자" on public.reports;
create policy "내 신고와 운영자" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_staff()));

drop policy "내 댓글 신고와 운영자" on public.comment_reports;
create policy "내 댓글 신고와 운영자" on public.comment_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_staff()));

drop policy "내 게시판 신고와 운영자" on public.board_reports;
create policy "내 게시판 신고와 운영자" on public.board_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_staff()));

drop policy "내 이용 제한과 운영자" on public.member_restrictions;
create policy "내 이용 제한과 운영자" on public.member_restrictions
  for select to authenticated
  using (member_id = (select auth.uid()) or (select private.is_staff()));

drop policy "내 경고와 운영자" on public.member_warnings;
create policy "내 경고와 운영자" on public.member_warnings for select to authenticated
  using (member_id = (select auth.uid()) or (select private.is_staff()));

-- ─────────────────────────────────────────────
-- 역할 지정 (최고 관리자만, 회원 ↔ 운영 도우미)
-- ─────────────────────────────────────────────
create function public.set_member_role(target uuid, new_role text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before text;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if new_role not in ('member', 'moderator') then
    raise exception 'role_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if target = (select auth.uid()) then
    raise exception 'cannot_change_self' using errcode = 'P0001';
  end if;
  select role::text into before from public.profiles where id = target;
  if before is null then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if before = 'admin' then
    raise exception 'cannot_change_admin' using errcode = 'P0001';
  end if;
  if before = new_role then
    raise exception 'no_change' using errcode = 'P0001';
  end if;
  update public.profiles set role = new_role::public.member_role where id = target;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'member_role', 'profiles', target,
          jsonb_build_object('before', before, 'after', new_role, 'note', btrim(note)));
end;
$$;
revoke all on function public.set_member_role(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_member_role(uuid, text, text) to authenticated;

-- 휴지통 글 보호: 운영 도우미의 격리(휴지통으로 옮긴 뒤 이어서 고침)도 통과시킨다.
-- 운영 도우미는 RLS로 남의 글을 직접 고칠 수 없고, 휴지통 글에 쓸 수 있는 함수는 격리뿐이다.
create or replace function private.guard_trashed_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.trashed_at is not null and not private.is_staff() then
    raise exception 'post_trashed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- moderate_post: 20261021000000_appeals.sql 본문 그대로, 권한 확인만 바꿈
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
  if not private.is_staff()
     -- 운영 도우미: 되살리기와 휴지통 글은 최고 관리자만
     or (not private.is_admin()
         and (decision = 'restore' or exists (select 1 from public.posts where id = target and trashed_at is not null))) then
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

-- moderate_comment: 20261103000000_comments.sql 본문 그대로, 권한 확인만 바꿈
create or replace function public.moderate_comment(target uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments%rowtype;
  open_count integer;
begin
  if not private.is_staff() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if decision not in ('dismiss', 'hide', 'restore') then
    raise exception 'decision_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  select * into c from public.comments where id = target;
  if c.id is null then
    raise exception 'comment_not_found' using errcode = 'P0001';
  end if;
  select count(*) into open_count from public.comment_reports where comment_id = target and status = 'open';

  if decision = 'hide' then
    update public.comments set hidden_at = coalesce(hidden_at, now()), pinned = false where id = target;
    update public.comment_reports set status = 'actioned', resolved_at = now() where comment_id = target and status = 'open';
    perform private.notify(c.author_id, 'comment_hidden', null, c.post_id);
  else
    update public.comments set hidden_at = null where id = target;
    update public.comment_reports set status = 'dismissed', resolved_at = now() where comment_id = target and status = 'open';
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'moderation', 'comments', target,
          jsonb_build_object('decision', decision, 'note', btrim(note), 'open_reports', open_count, 'body', c.body));
end;
$$;

-- moderate_board: 20261105000000_boards.sql 본문 그대로, 권한 확인만 바꿈
create or replace function public.moderate_board(target_post uuid, target_reply uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  open_count integer;
begin
  if not private.is_staff() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if decision not in ('dismiss', 'hide') then
    raise exception 'decision_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;

  if target_reply is null then
    select author_id into author from public.board_posts where id = target_post;
  else
    select author_id into author from public.board_replies where id = target_reply and board_post_id = target_post;
  end if;
  if author is null then
    raise exception 'target_not_found' using errcode = 'P0001';
  end if;
  select count(*) into open_count from public.board_reports
  where board_post_id = target_post and reply_id is not distinct from target_reply and status = 'open';

  if target_reply is null then
    update public.board_posts set hidden_at = case when decision = 'hide' then coalesce(hidden_at, now()) end where id = target_post;
  else
    update public.board_replies set hidden_at = case when decision = 'hide' then coalesce(hidden_at, now()) end where id = target_reply;
  end if;
  update public.board_reports
  set status = case when decision = 'hide' then 'actioned' else 'dismissed' end::public.report_status, resolved_at = now()
  where board_post_id = target_post and reply_id is not distinct from target_reply and status = 'open';
  if decision = 'hide' then
    perform private.notify_board(author, 'board_hidden', null, target_post);
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'moderation', case when target_reply is null then 'board_posts' else 'board_replies' end,
          coalesce(target_reply, target_post), jsonb_build_object('decision', decision, 'note', btrim(note), 'open_reports', open_count));
end;
$$;

-- admin_reporter_stats: 20261123000000_limits_quarantine.sql 본문 그대로, 권한 확인만 바꿈
create or replace function public.admin_reporter_stats(ids uuid[])
returns table (reporter_id uuid, total integer, actioned integer, dismissed integer, unreliable boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
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

-- member_sanction_history: 20261031000000_member_sanctions.sql 본문 그대로, 권한 확인만 바꿈
create or replace function public.member_sanction_history(target uuid)
returns table (action text, detail jsonb, actor_handle text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
    select a.detail ->> 'action', a.detail, p.handle::text, a.created_at
    from private.audit_log a
    left join public.profiles p on p.id = a.actor_id
    where a.target_table = 'profiles' and a.target_id = target and a.action = 'sanction'
    order by a.id desc
    limit 100;
end;
$$;

-- sanction_member: 20261122000000_admin_tools.sql 본문 그대로, 권한 확인만 바꿈
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
  if not private.is_staff()
     -- 운영 도우미: 일반 회원에게 경고만
     or (not private.is_admin()
         and (action <> 'warn' or exists (select 1 from public.profiles where id = target and role::text <> 'member'))) then
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

-- admin_posts_action: 20261123000000_limits_quarantine.sql 본문 그대로, 권한 확인만 바꿈
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
  if not private.is_staff()
     -- 운영 도우미: 불법 촬영물 격리만 (해제 · 휴지통 · 영구 삭제는 최고 관리자)
     or (not private.is_admin() and action <> 'quarantine') then
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
