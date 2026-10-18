-- 연도 책 속표지의 달 목차 (프로필 /u/<handle>에서 한 해를 펼쳤을 때).
--  · 기준은 촬영 날짜(shot_on)의 달. 날짜를 적지 않은 글은 어느 달에도 들어가지 않는다
--  · security invoker: 보는 사람이 볼 수 있는 글만 세어진다 (RLS). 공개 화면이라 anon도 쓴다

create function public.author_year_months(author uuid, target_year integer)
returns table (month integer, posts bigint, photos bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select p.id, extract(month from p.shot_on)::integer as m
    from public.posts p
    where p.author_id = author
      and p.status = 'published'
      and p.held_at is null
      and p.shot_year = target_year
      and p.shot_on is not null
  )
  select
    m.m,
    count(distinct m.id),
    (select count(*) from public.photos ph join mine x on x.id = ph.post_id where x.m = m.m)
  from mine m
  group by m.m
  order by m.m;
$$;

revoke all on function public.author_year_months(uuid, integer) from public;
grant execute on function public.author_year_months(uuid, integer) to anon, authenticated;
