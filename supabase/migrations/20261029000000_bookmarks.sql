-- 저장(북마크): 마음에 드는 게시물을 내 공간에 모아 둔다 (사진 내려받기 대신)
--  · 저장 목록 · 저장 수는 본인만 본다 (작성자에게도 알리지 않음)
--  · 볼 수 있는 글만 저장할 수 있다 · 한 사람 최대 5000개
--  · 나중에 볼 수 없게 된 글(숨김 · 탈퇴 등)은 목록에서 자동으로 빠진다 (posts RLS)

create table public.bookmarks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index bookmarks_user_recent_idx on public.bookmarks (user_id, created_at desc);
create index bookmarks_post_idx on public.bookmarks (post_id);

alter table public.bookmarks enable row level security;
revoke all on public.bookmarks from public, anon, authenticated;
grant select, delete on public.bookmarks to authenticated;
grant insert (user_id, post_id) on public.bookmarks to authenticated;

create policy "내 저장만 본다" on public.bookmarks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "볼 수 있는 게시된 글을 저장한다" on public.bookmarks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
  );
create policy "내 저장을 지운다" on public.bookmarks
  for delete to authenticated using (user_id = (select auth.uid()));

create function private.before_bookmark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.bookmarks where user_id = new.user_id) >= 5000 then
    raise exception 'bookmark_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger bookmarks_limit
before insert on public.bookmarks
for each row execute function private.before_bookmark();

revoke all on function private.before_bookmark() from public, anon, authenticated;
