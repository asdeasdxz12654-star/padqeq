-- 태그 (S-04 · S-05)
--  · 종류: 작품 · 캐릭터 · 행사 · 장소 · 일반. 캐릭터는 작품 아래 (2단계 계층)
--  · 별칭: 한 · 영 · 일 표기를 같은 태그로 (검색용, 소문자 비교)
--  · 공식(official) / 제안(pending): 운영자가 만든 태그는 공식. 회원 제안은 승인 전까지 제안자 게시물에만.

create type public.tag_kind as enum ('work', 'character', 'event', 'place', 'general');
create type public.tag_status as enum ('official', 'pending');

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  kind public.tag_kind not null,
  -- 주소용 (/t/원신). 소문자 · 공백은 '-' · 주소에서 문제가 되는 문자 없음
  slug text not null unique
    check (char_length(slug) between 1 and 60 and slug = lower(slug) and slug !~ '[[:space:]/?#%\\&+.]'),
  name text not null check (char_length(btrim(name)) between 1 and 60 and name !~ '[[:cntrl:]]'),
  parent_id uuid references public.tags (id) on delete restrict,
  status public.tag_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- 캐릭터만 상위(작품)를 가진다
  constraint tag_parent_rule check ((kind = 'character') = (parent_id is not null))
);
create index tags_parent_idx on public.tags (parent_id) where parent_id is not null;

create table public.tag_aliases (
  tag_id uuid not null references public.tags (id) on delete cascade,
  alias extensions.citext not null check (char_length(alias::text) between 1 and 60),
  primary key (tag_id, alias)
);
create index tag_aliases_alias_idx on public.tag_aliases (alias);

create table public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id)
);
create index post_tags_tag_idx on public.post_tags (tag_id);

-- 상위가 정말 작품인지 (check 제약은 다른 행을 볼 수 없어 트리거로)
create function private.enforce_tag_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.tags where id = new.parent_id and kind = 'work'
  ) then
    raise exception '캐릭터의 상위 태그는 작품이어야 합니다' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger tags_parent_rule
before insert or update of parent_id on public.tags
for each row execute function private.enforce_tag_parent();

-- 이 사용자가 볼 수 있는(붙일 수 있는) 태그: 공식이거나 내가 제안했거나 운영자
create function private.tag_is_usable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tags t
    where t.id = target
      and (t.status = 'official' or t.created_by = (select auth.uid()) or private.is_admin())
  );
$$;
revoke all on function private.enforce_tag_parent(), private.tag_is_usable(uuid) from public, anon, authenticated;
grant execute on function private.tag_is_usable(uuid) to anon, authenticated;

alter table public.tags enable row level security;
alter table public.tag_aliases enable row level security;
alter table public.post_tags enable row level security;

revoke all on public.tags, public.tag_aliases, public.post_tags from anon, authenticated;
grant select on public.tags, public.tag_aliases, public.post_tags to anon, authenticated;
-- 상태(공식 여부)는 직접 넣을 수 없다: 기본값 pending, 운영자는 승인 함수로
grant insert (kind, slug, name, parent_id, created_by) on public.tags to authenticated;
grant insert, delete on public.tag_aliases to authenticated;
grant insert, delete on public.post_tags to authenticated;

create policy "공식 · 내 제안 · 운영자" on public.tags
  for select to anon, authenticated using (private.tag_is_usable(id));
create policy "업로드 권한자가 제안한다" on public.tags
  for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.can_upload()));

create policy "볼 수 있는 태그의 별칭" on public.tag_aliases
  for select to anon, authenticated using (private.tag_is_usable(tag_id));
create policy "운영자 또는 제안자가 별칭을 단다" on public.tag_aliases
  for insert to authenticated
  with check (
    (select private.is_admin())
    or exists (select 1 from public.tags t where t.id = tag_id and t.created_by = (select auth.uid()) and t.status = 'pending')
  );
create policy "운영자가 별칭을 지운다" on public.tag_aliases
  for delete to authenticated using ((select private.is_admin()));

create policy "보이는 글의 보이는 태그" on public.post_tags
  for select to anon, authenticated
  using (private.post_is_visible(post_id) and private.tag_is_usable(tag_id));
create policy "작성자가 쓸 수 있는 태그를 붙인다" on public.post_tags
  for insert to authenticated
  with check (private.is_post_author(post_id) and private.tag_is_usable(tag_id));
create policy "작성자 또는 운영자가 뗀다" on public.post_tags
  for delete to authenticated
  using (private.is_post_author(post_id) or (select private.is_admin()));

-- 운영자: 태그 만들기(바로 공식) · 제안 승인
create function public.create_official_tag(
  tag_kind public.tag_kind,
  tag_slug text,
  tag_name text,
  parent uuid default null,
  aliases text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  a text;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  insert into public.tags (kind, slug, name, parent_id, status, created_by)
  values (tag_kind, tag_slug, btrim(tag_name), parent, 'official', (select auth.uid()))
  returning id into new_id;
  foreach a in array coalesce(aliases, '{}') loop
    if btrim(a) <> '' and lower(btrim(a)) <> lower(btrim(tag_name)) then
      insert into public.tag_aliases (tag_id, alias) values (new_id, btrim(a)) on conflict do nothing;
    end if;
  end loop;
  return new_id;
end;
$$;

create function public.approve_tag(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  update public.tags set status = 'official' where id = target;
end;
$$;

-- 탐색 "지금 많이 찍는 작품": 최근 N일 게시물 수 (캐릭터 태그는 상위 작품으로 셈)
create function public.trending_works(days integer default 7, max_rows integer default 10)
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
  join public.tags w on w.id = tagged.work_id and w.status = 'official'
  group by w.id, w.slug, w.name
  having count(*) filter (where tagged.published_at >= now() - make_interval(days => least(greatest(days, 1), 90))) > 0
  order by 4 desc, 5 desc, w.name
  limit least(greatest(max_rows, 1), 50);
$$;

revoke all on function public.create_official_tag(public.tag_kind, text, text, uuid, text[]),
  public.approve_tag(uuid), public.trending_works(integer, integer) from public, anon, authenticated;
grant execute on function public.create_official_tag(public.tag_kind, text, text, uuid, text[]),
  public.approve_tag(uuid) to authenticated;
grant execute on function public.trending_works(integer, integer) to anon, authenticated;
