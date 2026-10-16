-- 중복 태그 합치기 (운영)
--  · 같은 대상을 가리키는 태그(예: 장소 이름 · 주소로 따로 생긴 태그)를 하나로 합친다. 최고 관리자만, 이유와 함께, 감사 로그.
--  · 종류가 같아야 하고, 남길 태그는 공식이어야 한다. 없앨 태그는 공식 · 제안 모두 된다.
--  · 게시물 · 팔로우 · 별칭 · 하위 캐릭터 · 연결된 행사 · 지도 위치를 남길 태그로 옮긴다.
--    없앤 태그의 이름은 남길 태그의 별칭이 되고, 예전 주소(/t/옛-주소)는 남길 태그로 넘어간다.
--  · 되돌릴 수 없다 (감사 로그에 옮긴 수를 남긴다).

-- 예전 태그 주소 → 지금 태그
create table public.tag_slug_redirects (
  old_slug text primary key check (char_length(old_slug) between 1 and 60),
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index tag_slug_redirects_tag_idx on public.tag_slug_redirects (tag_id);
alter table public.tag_slug_redirects enable row level security;
revoke all on public.tag_slug_redirects from public, anon, authenticated;
grant select on public.tag_slug_redirects to anon, authenticated;
create policy "보이는 태그로 가는 예전 주소" on public.tag_slug_redirects
  for select to anon, authenticated using (private.tag_is_usable(tag_id));

create function public.merge_tags(source uuid, target uuid, note text)
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
                               'children', moved_children, 'event', moved_event, 'location', moved_location);
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'tag_merge', 'tags', target,
          jsonb_build_object('note', btrim(note), 'title', dst.name,
                             'from', jsonb_build_object('id', src.id, 'slug', src.slug, 'name', src.name, 'status', src.status))
          || result);
  return result;
end;
$$;
revoke all on function public.merge_tags(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.merge_tags(uuid, uuid, text) to authenticated;
