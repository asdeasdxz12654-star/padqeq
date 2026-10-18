-- 연도 책장 표지 숫자 (프로필 /u/<handle>의 책장).
--  · 기준은 촬영 연도 (책장 · 연도 칩과 같음). 게시된 글만, 임시 비공개 글은 뺀다
--  · security invoker: 보는 사람이 볼 수 있는 글만 세어진다 (RLS). 공개 화면이라 anon도 쓴다
--  · 함께한 사람: 승인된 회원 크레딧(본인 제외) + 미가입자 표기(external). 같은 사람은 한 번만

create function public.author_year_counts(author uuid, max_years integer default 12)
returns table (shot_year integer, photos bigint, events bigint, partners bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select p.id, p.shot_year
    from public.posts p
    where p.author_id = author
      and p.status = 'published'
      and p.held_at is null
      and p.shot_year is not null
  ),
  years as (
    select distinct m.shot_year
    from mine m
    order by m.shot_year desc
    limit greatest(coalesce(max_years, 12), 1)
  )
  select
    y.shot_year,
    (
      select count(*)
      from public.photos ph
      join mine m on m.id = ph.post_id
      where m.shot_year = y.shot_year
    ),
    (
      select count(distinct pt.tag_id)
      from public.post_tags pt
      join mine m on m.id = pt.post_id
      join public.tags t on t.id = pt.tag_id
      where m.shot_year = y.shot_year and t.kind = 'event'
    ),
    (
      -- 회원은 id로, 미가입자는 이름으로 센다 (같은 이름은 한 사람으로 본다)
      select count(distinct coalesce(c.member_id::text, nullif(btrim(c.external_label), '')))
      from public.credits c
      join mine m on m.id = c.post_id
      where m.shot_year = y.shot_year
        and (
          (c.status = 'approved' and c.member_id is not null and c.member_id <> author)
          or c.status = 'external'
        )
    )
  from years y
  order by y.shot_year desc;
$$;

revoke all on function public.author_year_counts(uuid, integer) from public;
grant execute on function public.author_year_counts(uuid, integer) to anon, authenticated;
