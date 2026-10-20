-- 알림 종류별로 받기 (회원 시안 46, 2026-10-20)
--  · 회원이 좋아요 · 댓글(답글 · 멘션 · 게시판 답글) · 메시지 · 행사 알림을 따로 끈다. 끈 종류는 알림을 만들지 않는다
--    (목록에도 휴대폰에도 안 쌓인다). 추억 알림은 예전 설정(profiles.memory_alerts)을 그대로 쓴다.
--  · 크레딧 요청 · 승인, 운영 안내(경고 · 숨김 · 소명 결과 · 운영자 알림)는 끌 수 없다.
--  · 좋아요 묶기는 화면에서 한다: 같은 글의 좋아요는 이미 '안 읽은 알림 하나'로 모인다(20261117) → 목록에서 그 뒤에 누른 사람 수를 센다.

create table public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  likes boolean not null default true,
  comments boolean not null default true,
  messages boolean not null default true,
  events boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from public, anon, authenticated;
grant select, insert, update (likes, comments, messages, events, updated_at) on public.notification_prefs to authenticated;
create policy "내 알림 설정" on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy "내 알림 설정을 만든다" on public.notification_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "내 알림 설정을 바꾼다" on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 알림 종류 → 끌 수 있는 묶음 (null이면 끌 수 없음)
create function private.notification_pref_of(kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when kind = 'post_liked' then 'likes'
    when kind in ('comment_added', 'comment_replied', 'comment_mentioned', 'board_replied') then 'comments'
    when kind in ('message_received', 'message_request') then 'messages'
    when kind in ('event_reminder', 'event_photos') then 'events'
    else null
  end;
$$;
revoke all on function private.notification_pref_of(text) from public, anon, authenticated;

create function private.before_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pref text := private.notification_pref_of(new.kind::text);
  wanted boolean;
begin
  if pref is not null then
    select case pref when 'likes' then p.likes when 'comments' then p.comments when 'messages' then p.messages when 'events' then p.events end
      into wanted
    from public.notification_prefs p where p.user_id = new.recipient_id;
    if wanted is false then
      return null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.before_notification() from public, anon, authenticated;
create trigger notifications_prefs before insert on public.notifications
  for each row execute function private.before_notification();
