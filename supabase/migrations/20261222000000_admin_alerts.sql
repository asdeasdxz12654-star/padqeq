-- 운영자 휴대폰 알림 (관리 시안 44, 2026-10-20)
--  · 긴급(admin_urgent)은 바로: 긴급 사유 신고(미성년자 · 초상권 · 도촬 · 딥페이크), 신고가 쌓여 게시물이 자동으로 숨겨짐, 소명(최고 관리자만).
--    같은 게시물로는 1시간에 한 번만 보낸다 (미성년자 신고는 신고 + 자동 숨김이 함께 일어난다).
--  · 하루 요약(admin_digest)은 매일 21:00 KST 워크플로가 부른다: 처리함에 남은 일이 있을 때만.
--  · 운영진마다 받는 방식을 고른다: all(긴급 + 요약, 기본) · urgent(긴급만) · off. 보내기는 기존 웹 푸시(1분마다)가 한다.

alter type public.notification_kind add value if not exists 'admin_urgent';
alter type public.notification_kind add value if not exists 'admin_digest';

create table public.admin_alert_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  mode text not null default 'all' check (mode in ('all', 'urgent', 'off')),
  updated_at timestamptz not null default now()
);
alter table public.admin_alert_settings enable row level security;
revoke all on public.admin_alert_settings from public, anon, authenticated;
grant select, insert, update (mode, updated_at) on public.admin_alert_settings to authenticated;
create policy "내 운영 알림 설정" on public.admin_alert_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "운영진이 운영 알림을 고른다" on public.admin_alert_settings for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles where id = (select auth.uid()) and role::text in ('admin', 'moderator')));
create policy "운영진이 운영 알림을 바꾼다" on public.admin_alert_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 긴급 알림 보내기 (운영 도우미는 신고만 · 소명은 최고 관리자만)
-- (plpgsql: 같은 마이그레이션에서 더한 알림 종류를 쓰므로, 만들 때가 아니라 부를 때 해석되게)
create function private.notify_staff_urgent(target_post uuid, admins_only boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, kind, post_id)
  select p.id, 'admin_urgent'::public.notification_kind, target_post
  from public.profiles p
  left join public.admin_alert_settings s on s.user_id = p.id
  where p.role::text in ('admin', 'moderator')
    and (not admins_only or p.role::text = 'admin')
    and coalesce(s.mode, 'all') <> 'off'
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = p.id and n.kind::text = 'admin_urgent'
        and n.post_id is not distinct from target_post and n.created_at > now() - interval '1 hour'
    );
end;
$$;
revoke all on function private.notify_staff_urgent(uuid, boolean) from public, anon, authenticated;

create function private.after_report_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason::text in ('minor_safety', 'portrait_rights', 'voyeurism', 'deepfake') then
    perform private.notify_staff_urgent(new.post_id, false);
  end if;
  return null;
end;
$$;
revoke all on function private.after_report_alert() from public, anon, authenticated;
create trigger reports_staff_alert after insert on public.reports
  for each row execute function private.after_report_alert();

create function private.after_auto_hold_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.held_at is null and new.held_at is not null and new.held_reason like 'auto:%' then
    perform private.notify_staff_urgent(new.id, false);
  end if;
  return null;
end;
$$;
revoke all on function private.after_auto_hold_alert() from public, anon, authenticated;
create trigger posts_auto_hold_alert after update of held_at on public.posts
  for each row execute function private.after_auto_hold_alert();

create function private.after_appeal_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_staff_urgent(new.post_id, true);
  return null;
end;
$$;
revoke all on function private.after_appeal_alert() from public, anon, authenticated;
create trigger appeals_staff_alert after insert on public.appeals
  for each row execute function private.after_appeal_alert();

-- 하루 요약 (매일 21:00 KST, DB 관리자 연결 전용). 보낸 수를 돌려준다.
create function private.admin_daily_digest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reports_open integer;
  others_open integer;
  sent integer;
begin
  select (select count(*) from public.reports where status = 'open')
       + (select count(*) from public.comment_reports where status = 'open')
       + (select count(*) from public.board_reports where status = 'open')
    into reports_open;
  select (select count(*) from public.message_reports where status = 'open')
       + (select count(*) from public.appeals where status = 'open')
       + (select count(*) from public.inquiries where status = 'open')
       + (select count(*) from public.credit_claims where status = 'open')
       + (select count(*) from public.events where status = 'proposed')
    into others_open;
  insert into public.notifications (recipient_id, kind)
  select p.id, 'admin_digest'::public.notification_kind
  from public.profiles p
  left join public.admin_alert_settings s on s.user_id = p.id
  where coalesce(s.mode, 'all') = 'all'
    and ((p.role::text = 'admin' and reports_open + others_open > 0) or (p.role::text = 'moderator' and reports_open > 0));
  get diagnostics sent = row_count;
  return sent;
end;
$$;
revoke all on function private.admin_daily_digest() from public, anon, authenticated;
