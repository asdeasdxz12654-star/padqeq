-- 인기순 (S-04 · ③ 남은 것)
--  · 최근 N일 동안 받은 좋아요 수로 줄 세운다 (탈퇴 유예 회원의 좋아요는 세지 않음 · 글의 좋아요 수와 같은 기준)
--  · 부른 사람이 볼 수 있는 게시된 글만 (임시 비공개 · 휴지통 제외). 숫자와 글 id만 돌려준다.
--  · 동점이면 최근에 좋아요를 더 받은 글이 먼저

create index if not exists post_likes_recent_idx on public.post_likes (created_at desc, post_id);

create function public.popular_posts(days integer default 30, max_rows integer default 200)
returns table (post_id uuid, likes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, count(*)::integer
  from public.post_likes l
  join public.posts p on p.id = l.post_id
  where l.created_at >= now() - make_interval(days => least(greatest(days, 1), 365))
    and private.author_active(l.user_id)
    and p.status = 'published'
    and p.held_at is null
    and p.trashed_at is null
    and private.post_is_visible(p.id)
  group by p.id
  order by 2 desc, max(l.created_at) desc, p.id
  limit least(greatest(max_rows, 1), 200);
$$;
revoke all on function public.popular_posts(integer, integer) from public, anon, authenticated;
grant execute on function public.popular_posts(integer, integer) to anon, authenticated;
