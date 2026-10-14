-- 게시물 공개 범위 · 예약 게시 · 댓글 설정 (S-08 ⑪ · A-02 ⑧ · P-04 댓글 제한)
--  · 공개 범위: public(전체) · followers(나를 팔로우하는 회원) · private(나만). 운영자는 모두 본다.
--  · 예약 게시: scheduled_at이 지나야 남에게 보인다. 게시 시각(published_at)도 예약 시각으로 맞춰 피드 순서가 맞게.
--  · 댓글 설정: everyone(모두) · followers(나를 팔로우하는 회원) · off(끔). 이미 달린 댓글은 그대로 보인다.
--  · 크레딧된 사람도 원 게시물 공개 범위를 따른다 (S-09)

create type public.post_visibility as enum ('public', 'followers', 'private');
create type public.comment_policy as enum ('everyone', 'followers', 'off');

alter table public.posts
  add column visibility public.post_visibility not null default 'public',
  add column scheduled_at timestamptz,
  add column comment_policy public.comment_policy not null default 'everyone';
create index posts_scheduled_idx on public.posts (scheduled_at) where scheduled_at is not null;

grant update (visibility, comment_policy, scheduled_at) on public.posts to authenticated;

-- 이 글을 볼 수 있는 사람인지 (공개 범위 · 예약)
create function private.audience_ok(author uuid, vis public.post_visibility, scheduled timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (scheduled is null or scheduled <= now())
     and case vis
       when 'public' then true
       when 'followers' then exists (
         select 1 from public.member_follows f where f.follower_id = (select auth.uid()) and f.followee_id = author)
       else false
     end;
$$;
revoke all on function private.audience_ok(uuid, public.post_visibility, timestamptz) from public, anon, authenticated;
grant execute on function private.audience_ok(uuid, public.post_visibility, timestamptz) to anon, authenticated;

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
            and not private.blocked_with_me(p.author_id) and private.audience_ok(p.author_id, p.visibility, p.scheduled_at))
           or p.author_id = (select auth.uid())
           or private.is_admin())
  );
$$;

drop policy "게시된 글 · 내 글 · 운영자" on public.posts;
create policy "게시된 글 · 내 글 · 운영자" on public.posts
  for select to anon, authenticated
  using (
    (status = 'published' and held_at is null and private.author_active(author_id)
     and not private.blocked_with_me(author_id) and private.audience_ok(author_id, visibility, scheduled_at))
    or author_id = (select auth.uid())
    or (select private.is_admin())
  );

-- 예약 시각 확인 · 게시 시각을 예약 시각으로
create or replace function private.enforce_publish_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scheduled_at is not null and (tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at) then
    if new.scheduled_at <= now() then
      new.scheduled_at := null;
    elsif new.scheduled_at > now() + interval '90 days' then
      raise exception 'schedule_too_far' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not exists (select 1 from public.photos where post_id = new.id) then
      raise exception '사진이 없는 게시물은 게시할 수 없습니다' using errcode = 'check_violation';
    end if;
    if new.has_people and not exists (select 1 from public.consent_records where post_id = new.id) then
      raise exception '촬영 동의 기록이 없으면 게시할 수 없습니다' using errcode = 'check_violation';
    end if;
    new.published_at := coalesce(new.scheduled_at, new.published_at, now());
  elsif new.status = 'published' and new.scheduled_at is distinct from old.scheduled_at and new.scheduled_at is not null then
    -- 이미 게시된 글의 예약은 바꿀 수 없다 (예약 중인 글만 시각을 옮긴다)
    if old.scheduled_at is null or old.scheduled_at <= now() then
      raise exception 'already_published' using errcode = 'P0001';
    end if;
    new.published_at := new.scheduled_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 댓글 설정: 끄면 아무도, 팔로워만이면 나를 팔로우하는 회원과 나만
create function private.can_comment_on(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = target
      and (p.author_id = (select auth.uid())
           or private.is_admin()
           or p.comment_policy = 'everyone'
           or (p.comment_policy = 'followers' and exists (
                 select 1 from public.member_follows f where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id)))
  );
$$;
revoke all on function private.can_comment_on(uuid) from public, anon, authenticated;
grant execute on function private.can_comment_on(uuid) to authenticated;

drop policy "게시된 글에 댓글을 단다" on public.comments;
create policy "게시된 글에 댓글을 단다" on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.post_is_visible(post_id)
    and private.can_comment_on(post_id)
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published' and p.held_at is null)
  );
