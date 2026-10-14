-- 오늘의 픽 (S-02 ③ · S-03 ④ · A-03 ⑥): 운영자가 날짜별로 고른 글 최대 10개
--  · 홈은 오늘(한국 날짜) 것이 없으면 가장 최근 날짜의 픽을 보여 준다
--  · 볼 수 없게 된 글(숨김 · 차단 등)은 픽에서도 보이지 않는다

create table public.daily_picks (
  pick_date date not null,
  post_id uuid not null references public.posts (id) on delete cascade,
  position smallint not null default 0 check (position between 0 and 9),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (pick_date, post_id)
);
create index daily_picks_date_idx on public.daily_picks (pick_date desc, position);

alter table public.daily_picks enable row level security;
revoke all on public.daily_picks from public, anon, authenticated;
grant select on public.daily_picks to anon, authenticated;
grant insert (pick_date, post_id, position, created_by), delete on public.daily_picks to authenticated;

create policy "볼 수 있는 글의 픽" on public.daily_picks for select to anon, authenticated
  using (private.post_is_visible(post_id) or (select private.is_admin()));
create policy "운영자가 픽을 고른다" on public.daily_picks for insert to authenticated
  with check (
    (select private.is_admin()) and created_by = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published' and p.held_at is null)
  );
create policy "운영자가 픽을 뺀다" on public.daily_picks for delete to authenticated using ((select private.is_admin()));

create function private.before_pick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.daily_picks where pick_date = new.pick_date) >= 10 then
    raise exception 'pick_limit' using errcode = 'P0001';
  end if;
  new.position := (select coalesce(max(position) + 1, 0) from public.daily_picks where pick_date = new.pick_date);
  return new;
end;
$$;
revoke all on function private.before_pick() from public, anon, authenticated;
create trigger daily_picks_rules before insert on public.daily_picks
  for each row execute function private.before_pick();
