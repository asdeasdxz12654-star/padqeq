-- 추억 알림 · 촬영 정보 · 태그 허브 탭 (S-18 · S-06 ⑧ · S-04 ⑧)
--  · 'N년 전 오늘' 알림: 오늘(한국 날짜)과 같은 월 · 일에 찍은 지난해 사진이 있으면(내가 올렸거나 크레딧된 글) 하루 한 번.
--    설정에서 끌 수 있다 (profiles.memory_alerts). 매일 새벽 정리 작업이 보낸다.
--  · 촬영 정보(EXIF 중 장비 · 설정만): 사진마다 카메라 · 렌즈 · 조리개 · 셔터 · ISO · 초점거리. GPS는 원래 저장하지 않는다.
--    업로더가 글마다 숨길 수 있다 (posts.show_exif)
--  · 태그 허브: 인기(최근 30일 좋아요) · 코스어(이 태그 글에 코스어로 승인된 회원)

alter type public.notification_kind add value if not exists 'memory_today';

alter table public.profiles add column memory_alerts boolean not null default true;
grant update (memory_alerts) on public.profiles to authenticated;

alter table public.photos add column exif jsonb check (exif is null or jsonb_typeof(exif) = 'object');
alter table public.posts add column show_exif boolean not null default true;
grant update (show_exif) on public.posts to authenticated;

-- 촬영 정보 넣기: 아직 공개되지 않은 내 사진에만, 정해진 칸 · 각 60자
create function public.set_photo_exif(target_post uuid, entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  info jsonb;
begin
  if not exists (select 1 from public.posts where id = target_post and author_id = (select auth.uid())) then
    raise exception 'post_not_editable' using errcode = '42501';
  end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 20 then
    raise exception 'entries_invalid' using errcode = 'P0001';
  end if;
  for entry in select * from jsonb_array_elements(entries) loop
    info := entry -> 'exif';
    if info is null or jsonb_typeof(info) <> 'object' then
      continue;
    end if;
    if exists (
      select 1 from jsonb_each(info)
      where key not in ('camera', 'lens', 'aperture', 'shutter', 'iso', 'focal')
         or jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 60
    ) then
      raise exception 'exif_invalid' using errcode = 'P0001';
    end if;
    update public.photos set exif = info
    where id = (entry ->> 'photo_id')::uuid and post_id = target_post and ready_at is null;
  end loop;
end;
$$;
revoke all on function public.set_photo_exif(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_photo_exif(uuid, jsonb) to authenticated;

-- 'N년 전 오늘' 알림 (매일 새벽 정리 작업, DB 관리자 연결 전용). 보낸 수를 돌려준다.
create function private.send_memory_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  sent integer;
begin
  with mine as (
    -- 내가 올렸거나 크레딧(승인)된, 오늘과 같은 월 · 일에 찍은 지난해 글
    select p.author_id as user_id, p.id as post_id, p.shot_on
    from public.posts p
    where p.status = 'published' and p.held_at is null and p.shot_on is not null
      and extract(month from p.shot_on) = extract(month from today) and extract(day from p.shot_on) = extract(day from today)
      and p.shot_on < today
    union all
    select c.member_id, p.id, p.shot_on
    from public.credits c join public.posts p on p.id = c.post_id
    where c.status = 'approved' and c.member_id is not null
      and p.status = 'published' and p.held_at is null and p.shot_on is not null
      and extract(month from p.shot_on) = extract(month from today) and extract(day from p.shot_on) = extract(day from today)
      and p.shot_on < today
  ), pick as (
    -- 사람마다 가장 오래된 사진 하나로 알림 (추억은 오래될수록)
    select distinct on (m.user_id) m.user_id, m.post_id
    from mine m
    join public.profiles pr on pr.id = m.user_id and pr.memory_alerts and pr.deletion_requested_at is null
    where not exists (
      select 1 from public.notifications n
      where n.recipient_id = m.user_id and n.kind = 'memory_today' and n.created_at > now() - interval '20 hours'
    )
    order by m.user_id, m.shot_on
  )
  insert into public.notifications (recipient_id, kind, post_id)
  select user_id, 'memory_today', post_id from pick;
  get diagnostics sent = row_count;
  return sent;
end;
$$;
revoke all on function private.send_memory_alerts() from public, anon, authenticated;

-- 태그 허브 '인기': 최근 days일 좋아요가 많은 순 (볼 수 있는 글만)
create function public.tag_popular_posts(tag uuid, days integer default 30, max_rows integer default 40)
returns table (post_id uuid, likes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select pt.post_id, count(l.user_id)::integer as likes
  from public.post_tags pt
  join public.post_likes l on l.post_id = pt.post_id and l.created_at > now() - make_interval(days => least(greatest(days, 1), 365))
  where pt.tag_id = tag and private.post_is_visible(pt.post_id)
  group by pt.post_id
  order by likes desc, pt.post_id
  limit least(greatest(max_rows, 1), 60);
$$;

-- 태그 허브 '코스어': 이 태그가 붙은 글에 코스어로 승인된 회원 (글 수 많은 순)
create function public.tag_cosers(tag uuid, max_rows integer default 60)
returns table (handle text, display_name text, posts integer)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.handle::text, pr.display_name, count(distinct c.post_id)::integer
  from public.post_tags pt
  join public.credits c on c.post_id = pt.post_id and c.role = 'cosplayer' and c.status = 'approved' and c.member_id is not null
  join public.profiles pr on pr.id = c.member_id and pr.deletion_requested_at is null
  where pt.tag_id = tag and private.post_is_visible(pt.post_id) and not private.blocked_with_me(pr.id)
  group by pr.id, pr.handle, pr.display_name
  order by 3 desc, pr.handle
  limit least(greatest(max_rows, 1), 100);
$$;

revoke all on function public.tag_popular_posts(uuid, integer, integer), public.tag_cosers(uuid, integer) from public, anon, authenticated;
grant execute on function public.tag_popular_posts(uuid, integer, integer), public.tag_cosers(uuid, integer) to anon, authenticated;
