-- 크리에이터 디렉토리 (S-17)
--  · 회원이 직접 켠 경우에만 올라간다 (creator_profiles 행이 있고 listed = true)
--  · 역할(코스어 · 모델 · 포토그래퍼 · 보정) · 지역 · 활동 시작 연도 · 주로 하는 작품 · 섭외 가능
--  · 섭외 가능은 만 19세 이상 확인을 한 회원만 켤 수 있다 (섭외 메시지가 19세 이상끼리라서)
--  · 정렬은 최근 활동순 (인기순 없음 — 새 크리에이터도 보이도록)

create table public.creator_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  listed boolean not null default true,
  roles public.credit_role[] not null
    check (cardinality(roles) between 1 and 4
           and roles <@ array['cosplayer', 'model', 'photographer', 'retoucher']::public.credit_role[]),
  region text check (region is null or private.is_region(region)),
  active_since smallint check (active_since between 1990 and 2100),
  works text not null default '' check (char_length(works) <= 100),
  casting_open boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.creator_profiles enable row level security;
revoke all on public.creator_profiles from public, anon, authenticated;
grant select on public.creator_profiles to anon, authenticated;
grant insert (user_id, listed, roles, region, active_since, works, casting_open) on public.creator_profiles to authenticated;
grant update (listed, roles, region, active_since, works, casting_open, updated_at) on public.creator_profiles to authenticated;
grant delete on public.creator_profiles to authenticated;

create policy "올린 크리에이터 · 내 정보" on public.creator_profiles for select to anon, authenticated
  using ((listed and private.author_active(user_id)) or user_id = (select auth.uid()));
create policy "내 크리에이터 정보를 만든다" on public.creator_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "내 크리에이터 정보를 고친다" on public.creator_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "내 크리에이터 정보를 지운다" on public.creator_profiles for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger creator_profiles_block_suspended before insert or update on public.creator_profiles
  for each row execute function private.block_suspended();

create function private.before_creator_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.works := btrim(new.works);
  new.updated_at := now();
  if new.casting_open and not private.is_adult(new.user_id) then
    raise exception 'adult_required' using errcode = '42501';
  end if;
  if new.active_since is not null and new.active_since > extract(year from now() at time zone 'Asia/Seoul') then
    raise exception 'active_since_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.before_creator_profile() from public, anon, authenticated;
create trigger creator_profiles_rules before insert or update on public.creator_profiles
  for each row execute function private.before_creator_profile();

-- 디렉토리 (최근 활동순: 마지막 게시 → 정보 수정). 공개된 글만 센다.
create function public.creator_directory(
  role_filter public.credit_role default null,
  region_filter text default null,
  casting_only boolean default false,
  max_rows integer default 30,
  skip integer default 0
)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  roles public.credit_role[],
  region text,
  active_since smallint,
  works text,
  casting_open boolean,
  last_active timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id, p.handle::text, p.display_name, c.roles, c.region, c.active_since, c.works, c.casting_open,
         greatest(c.updated_at, (select max(x.published_at) from public.posts x
                                  where x.author_id = c.user_id and x.status = 'published' and x.held_at is null))
  from public.creator_profiles c
  join public.profiles p on p.id = c.user_id
  where c.listed and p.deletion_requested_at is null
    and (role_filter is null or role_filter = any (c.roles))
    and (region_filter is null or c.region = region_filter)
    and (not casting_only or c.casting_open)
  order by 9 desc nulls last, p.handle
  limit least(greatest(max_rows, 1), 60) offset greatest(skip, 0);
$$;
revoke all on function public.creator_directory(public.credit_role, text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.creator_directory(public.credit_role, text, boolean, integer, integer) to anon, authenticated;
