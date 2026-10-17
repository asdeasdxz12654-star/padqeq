-- 행사 끝난 뒤 사진 올리기 알림
--  · 공식 행사가 끝난 다음 날 새벽, 참가 예정을 표시했던 회원 중 사진을 올릴 수 있는 회원에게 한 번만 알린다.
--  · 알림을 누르면 행사 태그(와 행사 장소 태그)가 붙은 채로 업로드 화면이 열린다.
--  · 매일 새벽 정리 작업(DB 관리자 연결)만 부른다. 보낸 수를 돌려준다.

alter type public.notification_kind add value if not exists 'event_photos';

alter table public.event_attendees add column photo_prompted_at timestamptz;

create function private.send_event_photo_prompts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  yesterday date := (now() at time zone 'Asia/Seoul')::date - 1;
  sent integer;
begin
  with due as (
    update public.event_attendees a set photo_prompted_at = now()
    from public.events e, public.profiles p
    where e.id = a.event_id and e.status = 'official' and e.ends_on = yesterday
      and p.id = a.user_id and p.can_upload
      and a.photo_prompted_at is null
      and private.author_active(a.user_id)
    returning a.user_id, a.event_id
  )
  insert into public.notifications (recipient_id, kind, event_id)
  select user_id, 'event_photos', event_id from due;
  get diagnostics sent = row_count;
  return sent;
end;
$$;
revoke all on function private.send_event_photo_prompts() from public, anon, authenticated;
