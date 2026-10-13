-- 태그 팔로우: 좋아하는 작품 · 캐릭터 · 행사 · 장소 태그를 모아 본다 (홈 '팔로우' 피드)
--  · 팔로우 목록은 본인만 본다 (다른 사람에게 공개하지 않음)
--  · 볼 수 있는 태그만 (공식 · 내 제안 · 운영자, tags RLS) · 한 사람 최대 300개

create table public.tag_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);
create index tag_follows_tag_idx on public.tag_follows (tag_id);

alter table public.tag_follows enable row level security;
revoke all on public.tag_follows from public, anon, authenticated;
grant select, delete on public.tag_follows to authenticated;
grant insert (user_id, tag_id) on public.tag_follows to authenticated;

create policy "내 팔로우만 본다" on public.tag_follows
  for select to authenticated using (user_id = (select auth.uid()));
create policy "볼 수 있는 태그를 팔로우한다" on public.tag_follows
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.tags t where t.id = tag_id));
create policy "내 팔로우를 끊는다" on public.tag_follows
  for delete to authenticated using (user_id = (select auth.uid()));

create function private.before_tag_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.tag_follows where user_id = new.user_id) >= 300 then
    raise exception 'tag_follow_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger tag_follows_limit
before insert on public.tag_follows
for each row execute function private.before_tag_follow();

revoke all on function private.before_tag_follow() from public, anon, authenticated;
