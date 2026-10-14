-- 좋아요 (S-06 ② 반응)
--  · 볼 수 있는 게시된 글에만, 한 사람이 한 번. 누가 눌렀는지는 본인 · 글쓴이 · 운영자만 본다.
--  · 수는 post_like_stats()로 누구나 본다 (숫자만)
--  · 알림은 묶는다 (S-10 ⑦): 같은 글에 아직 안 읽은 좋아요 알림이 있으면 또 보내지 않는다
--  · 정지 · 읽기 전용이면 누를 수 없다

alter type public.notification_kind add value if not exists 'post_liked';

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id, created_at desc);

alter table public.post_likes enable row level security;
revoke all on public.post_likes from public, anon, authenticated;
grant select, delete on public.post_likes to authenticated;
grant insert (post_id, user_id) on public.post_likes to authenticated;

create policy "내 좋아요 · 내 글의 좋아요 · 운영자" on public.post_likes for select to authenticated
  using (user_id = (select auth.uid()) or private.is_post_author(post_id) or (select private.is_admin()));
create policy "볼 수 있는 게시된 글에 좋아요" on public.post_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.post_is_visible(post_id)
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published' and p.held_at is null)
  );
create policy "내 좋아요를 취소한다" on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

create trigger post_likes_block_suspended before insert on public.post_likes
  for each row execute function private.block_suspended();

create function private.notify_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  select author_id into author from public.posts where id = new.post_id;
  if author is null or author = new.user_id then
    return null;
  end if;
  if exists (
    select 1 from public.notifications
    where recipient_id = author and kind = 'post_liked' and post_id = new.post_id and read_at is null
  ) then
    return null;
  end if;
  perform private.notify(author, 'post_liked', new.user_id, new.post_id);
  return null;
end;
$$;
revoke all on function private.notify_like() from public, anon, authenticated;
create trigger post_likes_notify after insert on public.post_likes
  for each row execute function private.notify_like();

-- 글마다 좋아요 수 · 내가 눌렀는지 (볼 수 있는 글만)
create function public.post_like_stats(ids uuid[])
returns table (post_id uuid, likes integer, liked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         (select count(*)::integer from public.post_likes l where l.post_id = p.id and private.author_active(l.user_id)),
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid()))
  from public.posts p
  where p.id = any (ids[1:200]) and private.post_is_visible(p.id);
$$;
revoke all on function public.post_like_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.post_like_stats(uuid[]) to anon, authenticated;
