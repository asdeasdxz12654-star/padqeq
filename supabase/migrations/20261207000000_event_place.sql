-- 행사에 장소 태그 연결
--  · 행사마다 "어디서 열리는지" 공식 장소 태그를 하나 고를 수 있다 (최고 관리자, 감사 로그).
--  · 행사 태그에 따로 위치가 없으면 장소 태그의 위치를 쓴다: 행사 화면의 작은 지도 · 촬영 장소 지도.
--    (대구콘페처럼 지도 검색에 없는 행사도 장소 위치만 정하면 지도에 나온다)
--  · 장소 태그를 합치면 연결된 행사도 남길 태그로 옮긴다.

alter table public.events add column place_tag_id uuid references public.tags (id) on delete set null;
create index events_place_idx on public.events (place_tag_id) where place_tag_id is not null;
-- 회원 제안(insert)에는 장소 칸 권한이 없다 (컬럼 단위 grant 그대로). 바꾸기는 아래 함수로만.

create function public.set_event_place(target uuid, place uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
  place_name text;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select * into ev from public.events where id = target for update;
  if ev.id is null then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if place is not null then
    select name into place_name from public.tags where id = place and kind = 'place' and status = 'official';
    if place_name is null then
      raise exception 'place_invalid' using errcode = 'P0001';
    end if;
  end if;
  if ev.place_tag_id is not distinct from place then
    return;
  end if;

  update public.events set place_tag_id = place, updated_at = now() where id = target;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'event_place', 'events', target,
          jsonb_build_object('title', ev.name, 'from', ev.place_tag_id, 'to', place, 'place', place_name));
end;
$$;
revoke all on function public.set_event_place(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_event_place(uuid, uuid) to authenticated;

-- 지도: 행사 태그는 자기 위치가 없으면 연결된 장소의 위치로 (반환 모양은 그대로)
create or replace function public.place_map(max_rows integer default 500)
returns table (id uuid, kind public.tag_kind, slug text, name text, lat double precision, lng double precision, post_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.kind, t.slug, t.name, coalesce(t.lat, pl.lat), coalesce(t.lng, pl.lng),
         (select count(*) from public.post_tags pt
            join public.posts p on p.id = pt.post_id
           where pt.tag_id = t.id and p.status = 'published' and p.held_at is null) as post_count
  from public.tags t
  left join public.events e on e.tag_id = t.id and e.status = 'official'
  left join public.tags pl on pl.id = e.place_tag_id and pl.status = 'official'
  where coalesce(t.lat, pl.lat) is not null and t.status = 'official'
  order by post_count desc, t.name
  limit least(greatest(coalesce(max_rows, 500), 1), 1000);
$$;

-- 합치기: 장소 태그에 연결된 행사도 남길 태그로 (결과에 places 수를 더한다)
create or replace function public.merge_tags(source uuid, target uuid, note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.tags%rowtype;
  dst public.tags%rowtype;
  moved_posts integer;
  moved_follows integer;
  moved_aliases integer;
  moved_children integer;
  moved_event boolean := false;
  moved_location boolean := false;
  moved_places integer;
  result jsonb;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if source is null or target is null or source = target then
    raise exception 'same_tag' using errcode = 'P0001';
  end if;
  -- 두 태그를 같은 순서로 잠근다 (동시에 반대로 합치는 경우 대비)
  perform 1 from public.tags where id in (source, target) order by id for update;
  select * into src from public.tags where id = source;
  select * into dst from public.tags where id = target;
  if src.id is null or dst.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if src.kind <> dst.kind then
    raise exception 'kind_mismatch' using errcode = 'P0001';
  end if;
  if dst.status <> 'official' then
    raise exception 'target_not_official' using errcode = 'P0001';
  end if;
  if dst.parent_id = src.id then
    raise exception 'target_is_child' using errcode = 'P0001';
  end if;
  -- 행사는 태그 하나에 하나만 이어진다
  if exists (select 1 from public.events where tag_id = source) then
    if exists (select 1 from public.events where tag_id = target) then
      raise exception 'event_conflict' using errcode = 'P0001';
    end if;
    update public.events set tag_id = target where tag_id = source;
    moved_event := true;
  end if;

  -- 게시물: 이미 두 태그가 다 붙은 글은 한 번만 남는다 (붙이기가 아니라 바꾸기라 글당 태그 수가 늘지 않는다)
  update public.post_tags pt set tag_id = target
  where pt.tag_id = source
    and not exists (select 1 from public.post_tags d where d.post_id = pt.post_id and d.tag_id = target);
  get diagnostics moved_posts = row_count;
  delete from public.post_tags where tag_id = source;

  update public.tag_follows f set tag_id = target
  where f.tag_id = source
    and not exists (select 1 from public.tag_follows d where d.user_id = f.user_id and d.tag_id = target);
  get diagnostics moved_follows = row_count;
  delete from public.tag_follows where tag_id = source;

  -- 별칭: 없앨 태그의 별칭과 이름을 남길 태그로 (남길 태그 이름과 같은 것은 뺀다)
  insert into public.tag_aliases (tag_id, alias)
  select target, a.alias from public.tag_aliases a
  where a.tag_id = source and lower(a.alias::text) <> lower(dst.name)
  union
  select target, btrim(src.name) where lower(btrim(src.name)) <> lower(dst.name)
  on conflict do nothing;
  get diagnostics moved_aliases = row_count;

  -- 이 장소에서 열리는 행사
  update public.events set place_tag_id = target where place_tag_id = source;
  get diagnostics moved_places = row_count;

  -- 하위 캐릭터 (작품끼리 합칠 때)
  update public.tags set parent_id = target where parent_id = source;
  get diagnostics moved_children = row_count;

  -- 지도 위치: 남길 태그에 없으면 가져온다
  if dst.lat is null and src.lat is not null then
    update public.tags set lat = src.lat, lng = src.lng where id = target;
    moved_location := true;
  end if;

  -- 예전 주소: 없앨 태그의 주소와, 그 태그로 가던 더 예전 주소 모두 남길 태그로
  update public.tag_slug_redirects set tag_id = target where tag_id = source;
  insert into public.tag_slug_redirects (old_slug, tag_id) values (src.slug, target)
  on conflict (old_slug) do update set tag_id = excluded.tag_id;

  delete from public.tags where id = source;

  result := jsonb_build_object('posts', moved_posts, 'follows', moved_follows, 'aliases', moved_aliases,
                               'children', moved_children, 'event', moved_event, 'location', moved_location,
                               'places', moved_places);
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'tag_merge', 'tags', target,
          jsonb_build_object('note', btrim(note), 'title', dst.name,
                             'from', jsonb_build_object('id', src.id, 'slug', src.slug, 'name', src.name, 'status', src.status))
          || result);
  return result;
end;
$$;
