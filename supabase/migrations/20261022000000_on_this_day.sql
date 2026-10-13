-- N년 전 이맘때 (홈): 촬영일(shot_on)이 오늘 앞뒤 span일 안에 드는 예전 해의 게시물
--  · 촬영 연도만 아는 글(shot_on 없음)은 넣지 않는다
--  · 연말 · 연초를 넘나드는 경우(12/30 ↔ 1/2)와 2월 29일(평년에는 2월 28일)도 맞춘다
--  · security invoker: 볼 수 있는 글만 (RLS)

create index posts_shot_on_idx on public.posts (shot_on) where status = 'published' and shot_on is not null;

create function public.on_this_day(target date, span integer default 3, max_rows integer default 20)
returns table (post_id uuid, years_ago integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, min(k)::integer as years_ago
  from public.posts p
  cross join lateral generate_series(
    (extract(year from target) - extract(year from p.shot_on))::integer - 1,
    (extract(year from target) - extract(year from p.shot_on))::integer + 1
  ) as k
  where p.status = 'published'
    and p.held_at is null
    and p.shot_on is not null
    and p.shot_on < target - least(greatest(span, 0), 7)
    and k >= 1
    and abs((p.shot_on + make_interval(years => k))::date - target) <= least(greatest(span, 0), 7)
  group by p.id, p.shot_on
  order by years_ago, p.shot_on desc
  limit least(greatest(max_rows, 1), 40);
$$;

revoke all on function public.on_this_day(date, integer, integer) from public;
grant execute on function public.on_this_day(date, integer, integer) to anon, authenticated;
