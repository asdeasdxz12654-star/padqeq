-- 촬영 장소 지도 (S-04 지도 보기)
--  · 장소 · 행사 태그에 대략 위치(위도 · 경도)를 단다. 운영자(최고 관리자 · 운영 도우미)만 정한다.
--  · 사진 속 GPS는 계속 지운다. 지도에는 태그(공원 · 행사장) 단위로만 보인다.
--  · 공식 태그 중 위치가 있는 것만, 볼 수 있는 게시물 수와 함께 (RLS 그대로: 보는 사람마다 다를 수 있다)

alter table public.tags
  add column lat double precision,
  add column lng double precision,
  add constraint tag_location_pair check ((lat is null) = (lng is null)),
  add constraint tag_location_range check (lat is null or (lat between -90 and 90 and lng between -180 and 180)),
  add constraint tag_location_kind check (lat is null or kind in ('place', 'event'));
create index tags_location_idx on public.tags (id) where lat is not null;

-- 운영자: 위치 정하기 · 지우기 (둘 다 null이면 지움). 감사 로그를 남긴다.
create function public.set_tag_location(target uuid, new_lat double precision, new_lng double precision, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_ public.tags%rowtype;
begin
  if not private.is_staff() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if (new_lat is null) <> (new_lng is null)
     or (new_lat is not null and (new_lat not between -90 and 90 or new_lng not between -180 and 180)) then
    raise exception 'location_invalid' using errcode = 'P0001';
  end if;
  select * into row_ from public.tags where id = target for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if row_.kind not in ('place', 'event') then
    raise exception 'kind_invalid' using errcode = 'P0001';
  end if;

  update public.tags set lat = new_lat, lng = new_lng where id = target;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'tag_location', 'tags', target,
          jsonb_build_object('note', btrim(note), 'title', row_.name,
                             'from', case when row_.lat is null then null else jsonb_build_array(row_.lat, row_.lng) end,
                             'to', case when new_lat is null then null else jsonb_build_array(new_lat, new_lng) end));
end;
$$;
revoke all on function public.set_tag_location(uuid, double precision, double precision, text) from public, anon, authenticated;
grant execute on function public.set_tag_location(uuid, double precision, double precision, text) to authenticated;

-- 지도: 위치가 있는 공식 장소 · 행사 태그와 보이는 게시물 수 (보는 사람의 권한으로 센다)
create function public.place_map(max_rows integer default 500)
returns table (id uuid, kind public.tag_kind, slug text, name text, lat double precision, lng double precision, post_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.kind, t.slug, t.name, t.lat, t.lng,
         (select count(*) from public.post_tags pt
            join public.posts p on p.id = pt.post_id
           where pt.tag_id = t.id and p.status = 'published' and p.held_at is null) as post_count
  from public.tags t
  where t.lat is not null and t.status = 'official'
  order by post_count desc, t.name
  limit least(greatest(coalesce(max_rows, 500), 1), 1000);
$$;
revoke all on function public.place_map(integer) from public;
grant execute on function public.place_map(integer) to anon, authenticated;
