-- 회원이 만든 태그를 승인 없이 바로 공개 (2026-10-20 결정)
--  · 예전: 회원이 만든 태그는 '제안'(pending)이라 운영자가 승인할 때까지 만든 사람에게만 보였다
--    (다른 사람에게는 글의 태그 · 태그 페이지 · 검색이 안 보여 같은 태그가 거듭 만들어졌다)
--  · 이제: 만들자마자 모두에게 보이고 검색 · 관련 태그 · 많이 찍는 작품에도 잡힌다.
--    status 'pending'은 '운영자가 아직 확인하지 않은 새 태그'라는 뜻으로만 남는다 (태그 관리에서 확인 · 합치기 · 지우기)
--  · 대신 만들 때 막는다: 금칙어 · 신규 계정 링크(댓글과 같은 규칙), 회원별 하루 새 태그 수(daily_new_tags, 기본 20, 운영자 제외)

-- ─────────────────────────────────────────────
-- 누구나 모든 태그를 본다
-- ─────────────────────────────────────────────
create or replace function private.tag_is_usable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tags t where t.id = target);
$$;

drop policy "공식 · 내 제안 · 운영자" on public.tags;
create policy "모든 태그" on public.tags for select to anon, authenticated using (true);

-- ─────────────────────────────────────────────
-- 만들 때 확인: 금칙어 · 링크 · 하루 개수
-- ─────────────────────────────────────────────
insert into public.site_limits (key, value, min_value, max_value) values ('daily_new_tags', 20, 1, 500);

create function private.before_member_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 운영자(공식 태그 만들기)는 check_text도 건너뛴다
  perform private.check_text(new.created_by, new.name);
  if new.created_by is not null
     and not exists (select 1 from public.profiles where id = new.created_by and role = 'admin')
     and (select count(*) from public.tags where created_by = new.created_by and created_at > now() - interval '1 day')
         >= private.limit_value('daily_new_tags', 20) then
    raise exception 'tag_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.before_member_tag() from public, anon, authenticated;
create trigger tags_member_rules before insert on public.tags
  for each row execute function private.before_member_tag();

create function private.before_tag_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_text((select auth.uid()), new.alias);
  return new;
end;
$$;
revoke all on function private.before_tag_alias() from public, anon, authenticated;
create trigger tag_aliases_member_rules before insert on public.tag_aliases
  for each row execute function private.before_tag_alias();

-- ─────────────────────────────────────────────
-- 관련 태그 · 많이 찍는 작품: 새 태그도 센다
-- ─────────────────────────────────────────────
create or replace function public.related_tags(tag uuid, max_rows integer default 8)
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
  join public.tags t on t.id = b.tag_id
  where a.tag_id = related_tags.tag
    and t.parent_id is distinct from related_tags.tag
    and t.id is distinct from (select parent_id from public.tags where id = related_tags.tag)
  group by t.id, t.slug, t.name, t.kind
  order by 5 desc, t.name
  limit least(greatest(max_rows, 1), 20);
$$;

create or replace function public.trending_works(days integer default 7, max_rows integer default 10)
returns table (id uuid, slug text, name text, recent_count bigint, total_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with tagged as (
    select distinct p.id as post_id, p.published_at, coalesce(t.parent_id, t.id) as work_id
    from public.posts p
    join public.post_tags pt on pt.post_id = p.id
    join public.tags t on t.id = pt.tag_id
    where p.status = 'published' and t.kind in ('work', 'character')
  )
  select w.id, w.slug, w.name,
         count(*) filter (where tagged.published_at >= now() - make_interval(days => least(greatest(days, 1), 90))),
         count(*)
  from tagged
  join public.tags w on w.id = tagged.work_id
  group by w.id, w.slug, w.name
  having count(*) filter (where tagged.published_at >= now() - make_interval(days => least(greatest(days, 1), 90))) > 0
  order by 4 desc, 5 desc, w.name
  limit least(greatest(max_rows, 1), 50);
$$;
