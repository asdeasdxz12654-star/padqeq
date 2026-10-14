-- 메시지 · 섭외 문의 (S-16)
--  · 1:1 대화만. 내가 팔로우하지 않는 사람이 처음 보낸 대화는 '메시지 요청'으로 들어오고, 수락 전에는 읽음 표시가 가지 않는다.
--  · 받기 범위: 모두 · 내가 팔로우한 사람만 · 받지 않음 (message_settings). 차단하면 서로 보낼 수 없다.
--  · 섭외 문의: 섭외 게시판 글에 지원하면 문의서(날짜 · 장소 · 콘셉트 · 조건 · 사용 범위 · 크레딧)가 첫 메시지로 붙는다.
--    만 19세 이상끼리만 주고받는다.
--  · 사진 첨부 없음(텍스트만). 가입 7일이 안 된 계정은 링크를 보낼 수 없다.
--  · 메시지는 대화 당사자만 본다. 운영자도 RLS로는 볼 수 없고, 신고된 대화만 admin_reported_thread()로 열람(감사 로그).
--  · 쓰기는 모두 함수로만 한다 (표에 직접 넣는 권한 없음)

alter type public.notification_kind add value if not exists 'message_received';
alter type public.notification_kind add value if not exists 'message_request';

create type public.message_receive as enum ('everyone', 'following', 'none');
create type public.thread_kind as enum ('direct', 'casting');
create type public.thread_member_status as enum ('active', 'request', 'declined');

create table public.message_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  receive public.message_receive not null default 'everyone',
  updated_at timestamptz not null default now()
);
alter table public.message_settings enable row level security;
revoke all on public.message_settings from public, anon, authenticated;
grant select, insert (user_id, receive), update (receive, updated_at) on public.message_settings to authenticated;
create policy "내 메시지 설정" on public.message_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;
revoke all on public.blocks from public, anon, authenticated;
grant select, insert (blocker_id, blocked_id), delete on public.blocks to authenticated;
create policy "내 차단 목록" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "차단한다" on public.blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "차단을 푼다" on public.blocks for delete to authenticated using (blocker_id = (select auth.uid()));

create function private.before_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.blocks where blocker_id = new.blocker_id) >= 1000 then
    raise exception 'block_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger blocks_limit before insert on public.blocks for each row execute function private.before_block();

create function private.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  kind public.thread_kind not null,
  board_post_id uuid references public.board_posts (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.thread_members (
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.thread_member_status not null,
  last_read_at timestamptz,
  -- 섭외 대화 첫 화면의 안전 가이드를 닫은 시각
  guide_dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index thread_members_user_idx on public.thread_members (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  -- 섭외 문의서 (첫 메시지에만)
  form jsonb check (form is null or jsonb_typeof(form) = 'object'),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, id desc);
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

alter table public.message_threads enable row level security;
alter table public.thread_members enable row level security;
alter table public.messages enable row level security;
revoke all on public.message_threads, public.thread_members, public.messages from public, anon, authenticated;
grant select on public.message_threads, public.thread_members, public.messages to authenticated;

create function private.in_thread(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.thread_members where thread_id = target and user_id = (select auth.uid()));
$$;
revoke all on function private.in_thread(uuid) from public, anon, authenticated;
grant execute on function private.in_thread(uuid) to authenticated;

-- 운영자도 여기로는 보지 못한다 (신고된 대화만 함수로)
create policy "내 대화" on public.message_threads for select to authenticated using (private.in_thread(id));
create policy "내 대화의 내 자리" on public.thread_members for select to authenticated using (user_id = (select auth.uid()));
create policy "내 대화의 메시지" on public.messages for select to authenticated using (private.in_thread(thread_id));

alter table public.notifications add column thread_id uuid references public.message_threads (id) on delete cascade;

-- 섭외 문의서: 정해진 칸 · 각 100자
create function private.valid_casting_form(form jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(form) = 'object'
    and (select bool_and(key in ('date', 'place', 'concept', 'terms', 'usage', 'credit')
                         and jsonb_typeof(value) = 'string' and char_length(value #>> '{}') <= 100)
         from jsonb_each(form))
    and form ? 'date' and form ? 'place' and form ? 'terms' and form ? 'usage';
$$;

-- 보내기 공통 검사 (정지 · 읽기 전용 · 링크 · 속도)
create function private.check_can_send(me uuid, body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if me is null or not exists (select 1 from public.profiles where id = me and deletion_requested_at is null) then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if private.is_suspended() then
    raise exception 'member_suspended' using errcode = '42501';
  end if;
  if private.switch_on('read_only') then
    raise exception 'site_read_only' using errcode = '42501';
  end if;
  if body is null or char_length(btrim(body)) not between 1 and 2000 then
    raise exception 'message_invalid' using errcode = 'P0001';
  end if;
  if body ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|kr|io|me|co|org|ly|gg)(/|\s|$))'
     and (select created_at from public.profiles where id = me) > now() - interval '7 days' then
    raise exception 'links_not_allowed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages where sender_id = me and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'message_rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- 알림: 받는 사람이 이미 안 읽은 메시지가 있으면 또 알리지 않는다
create function private.notify_message(thread uuid, recipient uuid, sender uuid, requested boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_read timestamptz;
  unread integer;
begin
  select last_read_at into last_read from public.thread_members where thread_id = thread and user_id = recipient;
  select count(*) into unread from public.messages m
  where m.thread_id = thread and m.sender_id <> recipient and (last_read is null or m.created_at > last_read);
  if unread > 1 then
    return;
  end if;
  insert into public.notifications (recipient_id, kind, actor_id, thread_id)
  values (recipient, case when requested then 'message_request' else 'message_received' end::public.notification_kind, sender, thread);
end;
$$;

-- 대화 시작 (이미 있으면 그 대화에 이어서). 대화 id를 돌려준다.
create function public.start_thread(recipient uuid, body text, casting_post uuid default null, form jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  setting public.message_receive;
  they_follow boolean;
  thread uuid;
  their_status public.thread_member_status;
  post public.board_posts%rowtype;
begin
  perform private.check_can_send(me, body);
  if recipient is null or recipient = me
     or not exists (select 1 from public.profiles where id = recipient and deletion_requested_at is null) then
    raise exception 'recipient_invalid' using errcode = 'P0001';
  end if;
  if private.blocked_between(me, recipient) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  they_follow := exists (select 1 from public.member_follows where follower_id = recipient and followee_id = me);

  if casting_post is not null then
    select * into post from public.board_posts where id = casting_post;
    if post.id is null or post.board <> 'casting' or post.author_id <> recipient or post.hidden_at is not null or post.closed_at is not null then
      raise exception 'casting_closed' using errcode = 'P0001';
    end if;
    if not private.is_adult(me) or not private.is_adult(recipient) then
      raise exception 'adult_required' using errcode = '42501';
    end if;
    if form is null or not private.valid_casting_form(form) then
      raise exception 'casting_form_invalid' using errcode = 'P0001';
    end if;
    select t.id into thread from public.message_threads t
    join public.thread_members a on a.thread_id = t.id and a.user_id = me
    join public.thread_members b on b.thread_id = t.id and b.user_id = recipient
    where t.kind = 'casting' and t.board_post_id = casting_post;
  else
    if form is not null then
      raise exception 'casting_form_invalid' using errcode = 'P0001';
    end if;
    select coalesce(receive, 'everyone') into setting from public.message_settings where user_id = recipient;
    if setting = 'none' or (setting = 'following' and not they_follow) then
      raise exception 'messages_closed' using errcode = 'P0001';
    end if;
    select t.id into thread from public.message_threads t
    join public.thread_members a on a.thread_id = t.id and a.user_id = me
    join public.thread_members b on b.thread_id = t.id and b.user_id = recipient
    where t.kind = 'direct';
  end if;

  if thread is null then
    if (select count(*) from public.message_threads where created_by = me and created_at > now() - interval '1 day') >= 20 then
      raise exception 'thread_rate_limited' using errcode = 'P0001';
    end if;
    insert into public.message_threads (kind, board_post_id, created_by)
    values (case when casting_post is null then 'direct' else 'casting' end::public.thread_kind, casting_post, me)
    returning id into thread;
    -- 섭외 지원 · 나를 팔로우하는 사람에게는 바로, 그 밖에는 메시지 요청으로
    their_status := case when casting_post is not null or they_follow then 'active' else 'request' end;
    insert into public.thread_members (thread_id, user_id, status, last_read_at) values (thread, me, 'active', now()), (thread, recipient, their_status, null);
  else
    select status into their_status from public.thread_members where thread_id = thread and user_id = recipient;
    if their_status = 'declined' then
      raise exception 'thread_closed' using errcode = 'P0001';
    end if;
    update public.thread_members set status = 'active' where thread_id = thread and user_id = me and status = 'request';
  end if;

  insert into public.messages (thread_id, sender_id, body, form)
  values (thread, me, btrim(body), case when casting_post is not null and not exists (select 1 from public.messages where thread_id = thread) then form end);
  update public.message_threads set last_message_at = now() where id = thread;
  update public.thread_members set last_read_at = now() where thread_id = thread and user_id = me;
  perform private.notify_message(thread, recipient, me, their_status = 'request');
  return thread;
end;
$$;

-- 이어서 보내기. 받은 요청에 답하면 수락한 것으로 본다.
create function public.send_message(thread uuid, body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  other uuid;
  other_status public.thread_member_status;
  my_status public.thread_member_status;
  new_id bigint;
begin
  perform private.check_can_send(me, body);
  select status into my_status from public.thread_members where thread_id = thread and user_id = me;
  if my_status is null then
    raise exception 'thread_not_found' using errcode = '42501';
  end if;
  select user_id, status into other, other_status from public.thread_members where thread_id = thread and user_id <> me;
  if other is null or other_status = 'declined' or my_status = 'declined'
     or private.blocked_between(me, other)
     or not exists (select 1 from public.profiles where id = other and deletion_requested_at is null) then
    raise exception 'thread_closed' using errcode = 'P0001';
  end if;
  if (select kind from public.message_threads where id = thread) = 'casting' and not (private.is_adult(me) and private.is_adult(other)) then
    raise exception 'adult_required' using errcode = '42501';
  end if;

  update public.thread_members set status = 'active' where thread_id = thread and user_id = me and status = 'request';
  insert into public.messages (thread_id, sender_id, body) values (thread, me, btrim(body)) returning id into new_id;
  update public.message_threads set last_message_at = now() where id = thread;
  update public.thread_members set last_read_at = now() where thread_id = thread and user_id = me;
  perform private.notify_message(thread, other, me, other_status = 'request');
  return new_id;
end;
$$;

-- 받은 요청 수락 · 거절 (거절하면 상대는 더 보낼 수 없다)
create function public.respond_thread(thread uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.thread_members set status = case when accept then 'active' else 'declined' end::public.thread_member_status
  where thread_id = thread and user_id = (select auth.uid());
  if not found then
    raise exception 'thread_not_found' using errcode = '42501';
  end if;
end;
$$;

create function public.mark_thread_read(thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.thread_members set last_read_at = now()
  where thread_id = thread and user_id = (select auth.uid());
  update public.notifications set read_at = now()
  where recipient_id = (select auth.uid()) and thread_id = thread and read_at is null;
end;
$$;

create function public.dismiss_thread_guide(thread uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.thread_members set guide_dismissed_at = now() where thread_id = thread and user_id = (select auth.uid());
$$;

-- 대화 목록 (상대 · 마지막 메시지 · 안 읽은 수). 상대가 요청을 수락하기 전에는 상대의 읽음 시각을 주지 않는다.
create function public.my_threads()
returns table (
  thread_id uuid,
  kind public.thread_kind,
  board_post_id uuid,
  my_status public.thread_member_status,
  other_id uuid,
  other_handle text,
  other_name text,
  other_read_at timestamptz,
  closed boolean,
  last_message_at timestamptz,
  last_body text,
  last_sender uuid,
  unread integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.kind, t.board_post_id, me.status,
         o.user_id, p.handle::text, p.display_name,
         case when o.status = 'active' then o.last_read_at end,
         (o.status = 'declined' or me.status = 'declined' or private.blocked_between(me.user_id, o.user_id) or p.deletion_requested_at is not null),
         t.last_message_at, lm.body, lm.sender_id,
         (select count(*)::integer from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from me.user_id and (me.last_read_at is null or m.created_at > me.last_read_at))
  from public.thread_members me
  join public.message_threads t on t.id = me.thread_id
  join public.thread_members o on o.thread_id = t.id and o.user_id <> me.user_id
  join public.profiles p on p.id = o.user_id
  left join lateral (select body, sender_id from public.messages m where m.thread_id = t.id order by m.id desc limit 1) lm on true
  where me.user_id = (select auth.uid())
  order by t.last_message_at desc
  limit 200;
$$;

-- 안 읽은 대화 수 (상단 표시용)
create function public.unread_thread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.thread_members me
  where me.user_id = (select auth.uid()) and me.status <> 'declined'
    and exists (select 1 from public.messages m where m.thread_id = me.thread_id and m.sender_id <> me.user_id
                and (me.last_read_at is null or m.created_at > me.last_read_at));
$$;

-- ─────────────────────────────────────────────
-- 메시지 신고 · 운영자 열람
-- ─────────────────────────────────────────────
create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  reported_id uuid references public.profiles (id) on delete set null,
  reason public.report_reason not null,
  detail text not null default '' check (char_length(detail) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index message_reports_one_open on public.message_reports (reporter_id, thread_id) where status = 'open';
create index message_reports_open_idx on public.message_reports (created_at) where status = 'open';
alter table public.message_reports enable row level security;
revoke all on public.message_reports from public, anon, authenticated;
grant select on public.message_reports to authenticated;
create policy "내 메시지 신고와 운영자" on public.message_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

-- 신고 (원하면 차단도 함께)
create function public.report_thread(thread uuid, reason public.report_reason, detail text, also_block boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  other uuid;
begin
  if not exists (select 1 from public.thread_members where thread_id = thread and user_id = me) then
    raise exception 'thread_not_found' using errcode = '42501';
  end if;
  if char_length(coalesce(detail, '')) > 1000 then
    raise exception 'detail_too_long' using errcode = 'P0001';
  end if;
  if (select count(*) from public.message_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  select user_id into other from public.thread_members where thread_id = thread and user_id <> me;
  insert into public.message_reports (reporter_id, thread_id, reported_id, reason, detail)
  values (me, thread, other, reason, btrim(coalesce(detail, '')))
  on conflict (reporter_id, thread_id) where status = 'open' do nothing;
  if also_block and other is not null then
    insert into public.blocks (blocker_id, blocked_id) values (me, other) on conflict do nothing;
  end if;
end;
$$;

-- 운영자: 신고된 대화 열람 (최근 200개). 열 때마다 감사 로그를 남긴다.
create function public.admin_reported_thread(report uuid)
returns table (message_id bigint, sender_handle text, body text, form jsonb, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select r.thread_id into thread from public.message_reports r where r.id = report;
  if thread is null then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'reported_thread_viewed', 'message_reports', report, jsonb_build_object('thread', thread));
  return query
    select m.id, p.handle::text, m.body, m.form, m.created_at
    from public.messages m left join public.profiles p on p.id = m.sender_id
    where m.thread_id = thread
    order by m.id desc
    limit 200;
end;
$$;

create function public.resolve_message_report(report uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if decision not in ('dismiss', 'actioned') then
    raise exception 'decision_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  update public.message_reports set status = case when decision = 'dismiss' then 'dismissed' else 'actioned' end::public.report_status,
         resolved_at = now()
  where id = report and status = 'open'
  returning reporter_id into reporter;
  if reporter is null then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  perform private.notify(reporter, 'report_reviewed', null, null);
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'moderation', 'message_reports', report, jsonb_build_object('decision', decision, 'note', btrim(note)));
end;
$$;

revoke all on function private.before_block(), private.blocked_between(uuid, uuid), private.valid_casting_form(jsonb),
  private.check_can_send(uuid, text), private.notify_message(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.start_thread(uuid, text, uuid, jsonb), public.send_message(uuid, text), public.respond_thread(uuid, boolean),
  public.mark_thread_read(uuid), public.dismiss_thread_guide(uuid), public.my_threads(), public.unread_thread_count(),
  public.report_thread(uuid, public.report_reason, text, boolean), public.admin_reported_thread(uuid),
  public.resolve_message_report(uuid, text, text) from public, anon, authenticated;
grant execute on function public.start_thread(uuid, text, uuid, jsonb), public.send_message(uuid, text), public.respond_thread(uuid, boolean),
  public.mark_thread_read(uuid), public.dismiss_thread_guide(uuid), public.my_threads(), public.unread_thread_count(),
  public.report_thread(uuid, public.report_reason, text, boolean), public.admin_reported_thread(uuid),
  public.resolve_message_report(uuid, text, text) to authenticated;

-- 대화한 사람이 모두 탈퇴해 아무도 없는 대화 지우기 (매일 정리 작업, DB 관리자 연결 전용)
create function private.purge_orphan_threads()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.message_threads t
    where not exists (select 1 from public.thread_members m where m.thread_id = t.id)
    returning 1
  )
  select count(*)::integer from gone;
$$;
revoke all on function private.purge_orphan_threads() from public, anon, authenticated;
