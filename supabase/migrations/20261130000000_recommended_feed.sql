-- 홈 '추천' 피드 (S-02 ②): 큐레이션 + 팔로우 + 반응 + 관심 분야를 섞은 순서
--  · 후보: 최근 60일 안에 게시된, 부른 사람이 볼 수 있는 글 (임시 비공개 · 휴지통 제외)
--  · 점수 (사람이 이해할 수 있는 단순한 규칙):
--      새로움 3 × e^(−지난 날 / 7)  +  최근 14일 좋아요 1.5 × ln(1 + 수)  +  최근 7일 오늘의 픽 3 (운영자 큐레이션이 가장 강함)
--      + 팔로우한 회원의 글 2  +  팔로우한 태그가 붙은 글 1.5  +  관심 분야 1
--  · 관심 분야는 가입 직후 · 설정에서 고른다 (profiles.interest_categories, 최대 4개)
--  · 숫자만 돌려준다 (누가 좋아요를 눌렀는지 · 누구를 팔로우하는지는 드러나지 않음)

alter table public.profiles
  add column interest_categories public.post_category[] not null default '{}' check (cardinality(interest_categories) <= 4);
grant update (interest_categories) on public.profiles to authenticated;

create function public.recommended_posts(max_rows integer default 200)
returns table (post_id uuid, score double precision)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as uid,
           coalesce((select interest_categories from public.profiles where id = (select auth.uid())), '{}') as cats
  ),
  cand as (
    select p.id, p.author_id, p.category, p.published_at
    from public.posts p
    where p.status = 'published' and p.held_at is null and p.trashed_at is null
      and p.published_at > now() - interval '60 days'
      and private.post_is_visible(p.id)
  ),
  scored as (
    select c.id, c.published_at,
      3 * exp(-extract(epoch from (now() - c.published_at)) / 86400.0 / 7)
      + 1.5 * ln(1 + (select count(*) from public.post_likes l
                      where l.post_id = c.id and l.created_at > now() - interval '14 days' and private.author_active(l.user_id)))
      + case when exists (select 1 from public.daily_picks d
                          where d.post_id = c.id and d.pick_date > (now() at time zone 'Asia/Seoul')::date - 7) then 3 else 0 end
      + case when exists (select 1 from public.member_follows f
                          where f.follower_id = me.uid and f.followee_id = c.author_id) then 2 else 0 end
      + case when exists (select 1 from public.tag_follows tf join public.post_tags pt on pt.tag_id = tf.tag_id
                          where tf.user_id = me.uid and pt.post_id = c.id) then 1.5 else 0 end
      + case when c.category = any (me.cats) then 1 else 0 end as score
    from cand c cross join me
  )
  select id, score from scored
  order by score desc, published_at desc, id
  limit least(greatest(max_rows, 1), 200);
$$;
revoke all on function public.recommended_posts(integer) from public, anon, authenticated;
grant execute on function public.recommended_posts(integer) to anon, authenticated;
