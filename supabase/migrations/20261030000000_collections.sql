-- 컬렉션(앨범): 내 게시물을 이름 붙인 묶음으로 정리한다 (예: "2025 여름 서코")
--  · 담을 수 있는 글: 내가 올린 글 · 내가 크레딧으로 승인된 글 (남의 사진을 모아 공개하는 것 방지)
--  · 공개(프로필에 보임) 또는 비공개(나만). 탈퇴 유예 중인 회원의 컬렉션은 남에게 보이지 않는다
--  · 컬렉션 안의 글은 지금 내가 볼 수 있는 글만 보인다 (posts RLS)
--  · 한 사람 100개 · 컬렉션당 200개

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60 and title !~ '[[:cntrl:]]'),
  description text not null default '' check (char_length(description) <= 500),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_owner_idx on public.collections (owner_id, updated_at desc);

create table public.collection_posts (
  collection_id uuid not null references public.collections (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, post_id)
);
create index collection_posts_post_idx on public.collection_posts (post_id);

-- 내가 올렸거나 크레딧으로 승인된 글인지
create function private.can_collect(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.posts where id = target and author_id = (select auth.uid()))
      or exists (
        select 1 from public.credits
        where post_id = target and member_id = (select auth.uid()) and status = 'approved'
      );
$$;

create function private.owns_collection(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.collections where id = target and owner_id = (select auth.uid()));
$$;

create function private.collection_is_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collections c
    where c.id = target
      and (c.owner_id = (select auth.uid())
           or (c.is_public and private.author_active(c.owner_id))
           or private.is_admin())
  );
$$;

revoke all on function private.can_collect(uuid), private.owns_collection(uuid), private.collection_is_visible(uuid)
  from public, anon, authenticated;
grant execute on function private.can_collect(uuid), private.owns_collection(uuid) to authenticated;
grant execute on function private.collection_is_visible(uuid) to anon, authenticated;

alter table public.collections enable row level security;
alter table public.collection_posts enable row level security;
revoke all on public.collections, public.collection_posts from public, anon, authenticated;
grant select on public.collections, public.collection_posts to anon, authenticated;
grant insert (owner_id, title, description, is_public) on public.collections to authenticated;
grant update (title, description, is_public) on public.collections to authenticated;
grant delete on public.collections to authenticated;
grant insert (collection_id, post_id) on public.collection_posts to authenticated;
grant delete on public.collection_posts to authenticated;

create policy "공개 컬렉션 · 내 컬렉션" on public.collections
  for select to anon, authenticated using (private.collection_is_visible(id));
create policy "내 컬렉션을 만든다" on public.collections
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "내 컬렉션을 고친다" on public.collections
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "내 컬렉션을 지운다" on public.collections
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "보이는 컬렉션의 보이는 글" on public.collection_posts
  for select to anon, authenticated
  using (private.collection_is_visible(collection_id) and private.post_is_visible(post_id));
create policy "내 컬렉션에 내 글 · 크레딧된 글을 담는다" on public.collection_posts
  for insert to authenticated
  with check (private.owns_collection(collection_id) and private.can_collect(post_id));
create policy "내 컬렉션에서 뺀다" on public.collection_posts
  for delete to authenticated using (private.owns_collection(collection_id));

-- 개수 제한 · 고친 시각
create function private.before_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.collections where owner_id = new.owner_id) >= 100 then
    raise exception 'collection_limit' using errcode = 'P0001';
  end if;
  new.title := btrim(new.title);
  new.description := btrim(new.description);
  new.updated_at := now();
  return new;
end;
$$;
create trigger collections_rules
before insert or update on public.collections
for each row execute function private.before_collection();

create function private.before_collection_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.collection_posts where collection_id = new.collection_id) >= 200 then
    raise exception 'collection_full' using errcode = 'P0001';
  end if;
  update public.collections set updated_at = now() where id = new.collection_id;
  return new;
end;
$$;
create trigger collection_posts_rules
before insert on public.collection_posts
for each row execute function private.before_collection_post();

revoke all on function private.before_collection(), private.before_collection_post() from public, anon, authenticated;
