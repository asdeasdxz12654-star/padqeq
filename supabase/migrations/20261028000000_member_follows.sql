-- 회원 팔로우: 좋아하는 작가 · 모델의 사진을 홈 '팔로우' 피드에 모은다
--  · 팔로우 목록 · 팔로워 수는 본인에게도 남에게도 공개하지 않는다 (내가 누구를 팔로우하는지만 본인이 본다)
--  · 알림을 보내지 않는다 · 자기 자신은 팔로우할 수 없다 · 한 사람 최대 1000명
--  · 볼 수 있는 프로필만 (탈퇴 유예 중인 회원 제외, profiles RLS)

create table public.member_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index member_follows_followee_idx on public.member_follows (followee_id);

alter table public.member_follows enable row level security;
revoke all on public.member_follows from public, anon, authenticated;
grant select, delete on public.member_follows to authenticated;
grant insert (follower_id, followee_id) on public.member_follows to authenticated;

create policy "내가 팔로우한 회원만 본다" on public.member_follows
  for select to authenticated using (follower_id = (select auth.uid()));
create policy "볼 수 있는 회원을 팔로우한다" on public.member_follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = followee_id));
create policy "내 팔로우를 끊는다" on public.member_follows
  for delete to authenticated using (follower_id = (select auth.uid()));

create function private.before_member_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.member_follows where follower_id = new.follower_id) >= 1000 then
    raise exception 'member_follow_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger member_follows_limit
before insert on public.member_follows
for each row execute function private.before_member_follow();

revoke all on function private.before_member_follow() from public, anon, authenticated;
