-- 나의 한 해 (개인 연말 결산). 본인만 보는 화면.
--  · 기준은 촬영 연도 (연도 칩과 같음). 게시된 글만, 임시 비공개 글은 뺀다
--  · security invoker: 내 글 · 내가 볼 수 있는 크레딧 · 프로필만 (RLS)

create function public.my_year_review(target_year integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  mine as (
    select p.id, p.title, p.category, p.shot_on, p.published_at
    from public.posts p, me
    where p.author_id = me.id and p.status = 'published' and p.held_at is null and p.shot_year = target_year
  ),
  -- 내 글에 함께한 회원 (승인된 크레딧) + 나를 크레딧한 글의 작성자
  partners as (
    select pr.handle::text as handle
    from public.credits c
    join mine on mine.id = c.post_id
    join public.profiles pr on pr.id = c.member_id, me
    where c.status = 'approved' and c.member_id <> me.id
    union all
    select pr.handle::text
    from public.credits c
    join public.posts p on p.id = c.post_id
    join public.profiles pr on pr.id = p.author_id, me
    where c.member_id = me.id and c.status = 'approved' and p.status = 'published' and p.held_at is null
      and p.shot_year = target_year and p.author_id <> me.id
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'year', target_year,
    'posts', (select count(*) from mine),
    'photos', (select count(*) from public.photos ph join mine on mine.id = ph.post_id),
    'months', (
      select coalesce(jsonb_object_agg(m, n), '{}'::jsonb)
      from (select extract(month from shot_on)::integer as m, count(*) as n from mine where shot_on is not null group by 1) x
    ),
    'undated', (select count(*) from mine where shot_on is null),
    'categories', (
      select coalesce(jsonb_object_agg(category, n), '{}'::jsonb)
      from (select category, count(*) as n from mine group by 1) x
    ),
    'top_tags', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'kind', kind, 'count', n) order by n desc, name), '[]'::jsonb)
      from (
        select t.slug, t.name, t.kind, count(*) as n
        from public.post_tags pt
        join mine on mine.id = pt.post_id
        join public.tags t on t.id = pt.tag_id
        group by t.id, t.slug, t.name, t.kind
        order by n desc, t.name
        limit 5
      ) x
    ),
    'credited_in', (
      select count(*)
      from public.credits c
      join public.posts p on p.id = c.post_id, me
      where c.member_id = me.id and c.status = 'approved' and p.status = 'published' and p.held_at is null
        and p.shot_year = target_year and p.author_id <> me.id
    ),
    'partners', (
      select coalesce(jsonb_agg(jsonb_build_object('handle', handle, 'count', n) order by n desc, handle), '[]'::jsonb)
      from (select handle, count(*) as n from partners group by handle order by n desc, handle limit 12) x
    ),
    'first_post', (select id from mine order by shot_on nulls last, published_at limit 1),
    'last_post', (select id from mine order by shot_on desc nulls last, published_at desc limit 1)
  ) end;
$$;

revoke all on function public.my_year_review(integer) from public, anon;
grant execute on function public.my_year_review(integer) to authenticated;
