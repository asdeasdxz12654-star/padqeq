-- 관련 태그 (S-04 ⑨): 이 태그가 붙은 게시물에 함께 많이 붙는 태그
--  · 부른 사람이 볼 수 있는 게시된 글 · 공식 태그만 센다 (security invoker → RLS)
--  · 작품 허브에서는 이미 위에 보여 주는 그 작품의 캐릭터와, 캐릭터 허브에서는 상위 작품을 뺀다
--  · 같은 수면 더 많은 글에 붙은 태그 → 이름 순

create function public.related_tags(tag uuid, max_rows integer default 8)
returns table (id uuid, slug text, name text, kind public.tag_kind, together bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.slug, t.name, t.kind, count(distinct a.post_id)
  from public.post_tags a
  join public.posts p on p.id = a.post_id and p.status = 'published' and p.held_at is null
  join public.post_tags b on b.post_id = a.post_id and b.tag_id <> a.tag_id
  join public.tags t on t.id = b.tag_id and t.status = 'official'
  where a.tag_id = related_tags.tag
    and t.parent_id is distinct from related_tags.tag
    and t.id is distinct from (select parent_id from public.tags where id = related_tags.tag)
  group by t.id, t.slug, t.name, t.kind
  order by 5 desc, t.name
  limit least(greatest(max_rows, 1), 20);
$$;
revoke all on function public.related_tags(uuid, integer) from public, anon, authenticated;
grant execute on function public.related_tags(uuid, integer) to anon, authenticated;
