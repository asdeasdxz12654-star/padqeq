-- 차단 범위 넓히기 (S-09 권한 · 안전: 차단하면 서로의 게시물 · 크레딧 · 메시지가 모두 숨겨짐)
--  · 차단한 사람 · 나를 차단한 사람의 게시물 · 댓글 · 게시판 글 · 답글이 서로 보이지 않는다
--  · 메시지 · 크레딧 요청은 이미 막혀 있다. 크리에이터 디렉토리에서도 서로 빠진다.
--  · 내 것 · 운영자 화면은 그대로다

create function private.blocked_with_me(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and other is not null and other <> (select auth.uid())
     and exists (
       select 1 from public.blocks
       where (blocker_id = (select auth.uid()) and blocked_id = other) or (blocker_id = other and blocked_id = (select auth.uid()))
     );
$$;
revoke all on function private.blocked_with_me(uuid) from public, anon, authenticated;
grant execute on function private.blocked_with_me(uuid) to anon, authenticated;

create or replace function private.post_is_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = target
      and ((p.status = 'published' and p.held_at is null and private.author_active(p.author_id)
            and not private.blocked_with_me(p.author_id))
           or p.author_id = (select auth.uid())
           or private.is_admin())
  );
$$;

drop policy "게시된 글 · 내 글 · 운영자" on public.posts;
create policy "게시된 글 · 내 글 · 운영자" on public.posts
  for select to anon, authenticated
  using (
    (status = 'published' and held_at is null and private.author_active(author_id) and not private.blocked_with_me(author_id))
    or author_id = (select auth.uid())
    or (select private.is_admin())
  );

drop policy "볼 수 있는 글의 댓글" on public.comments;
create policy "볼 수 있는 글의 댓글" on public.comments for select to anon, authenticated
  using (
    private.post_is_visible(post_id)
    and private.author_active(author_id)
    and (author_id = (select auth.uid()) or (select private.is_admin()) or not private.blocked_with_me(author_id))
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_admin()))
  );

drop policy "게시판 글은 누구나 본다 (가린 글은 쓴 사람 · 운영자만)" on public.board_posts;
create policy "게시판 글은 누구나 본다 (가린 글은 쓴 사람 · 운영자만)" on public.board_posts for select to anon, authenticated
  using (
    private.author_active(author_id)
    and ((select private.is_admin()) or not private.blocked_with_me(author_id))
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_admin()))
  );

drop policy "보이는 글의 답글" on public.board_replies;
create policy "보이는 글의 답글" on public.board_replies for select to anon, authenticated
  using (
    private.board_post_is_visible(board_post_id)
    and private.author_active(author_id)
    and ((select private.is_admin()) or not private.blocked_with_me(author_id))
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_admin()))
  );

create or replace function private.board_post_is_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_posts b
    where b.id = target and private.author_active(b.author_id)
      and (private.is_admin() or not private.blocked_with_me(b.author_id))
      and (b.hidden_at is null or b.author_id = (select auth.uid()) or private.is_admin())
  );
$$;

-- 크리에이터 디렉토리에서도 서로 뺀다
create or replace function public.creator_directory(
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
    and not private.blocked_with_me(c.user_id)
    and (role_filter is null or role_filter = any (c.roles))
    and (region_filter is null or c.region = region_filter)
    and (not casting_only or c.casting_open)
  order by 9 desc nulls last, p.handle
  limit least(greatest(max_rows, 1), 60) offset greatest(skip, 0);
$$;
