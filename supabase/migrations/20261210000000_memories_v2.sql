-- 추억 v2 묶음 (디자인 v2 이후 DB가 필요한 기능)
--  1) 사진 대표 색: 사진이 뜨기 전 자리를 그 사진의 색으로 칠한다 (브라우저가 변환하며 구한 평균 색)
--  2) 사진 뒷면 메모: 사진마다 작가가 남기는 짧은 메모 (사진 뒷면에 손글씨로)
--  3) 전시: 운영자가 공개 컬렉션 하나를 골라 홈에 '전시'로 건다
--  4) 타임캡슐: 내 사진에 편지를 묻어 두면 정한 날(1~10년 뒤) 아침에 열린다. 그 전에는 나도 편지를 못 읽는다

-- ─────────────────────────────────────────────
-- 1) 사진 대표 색
-- ─────────────────────────────────────────────
alter table public.photos add column color text check (color ~ '^#[0-9a-f]{6}$');
grant insert (color) on public.photos to authenticated;

-- ─────────────────────────────────────────────
-- 2) 사진 뒷면 메모 (작가만 고친다: 기존 '작성자가 사진을 고친다' 정책)
-- ─────────────────────────────────────────────
alter table public.photos add column back_memo text not null default ''
  check (char_length(back_memo) <= 200 and back_memo !~ '[\x01-\x09\x0b-\x1f\x7f]');
grant update (back_memo) on public.photos to authenticated;

-- ─────────────────────────────────────────────
-- 3) 전시
-- ─────────────────────────────────────────────
alter table public.collections
  add column exhibited_at timestamptz,
  add column exhibit_note text not null default '' check (char_length(exhibit_note) <= 200 and exhibit_note !~ '[[:cntrl:]]');
create index collections_exhibited_idx on public.collections (exhibited_at desc) where exhibited_at is not null;

-- 운영자만: 공개 컬렉션을 전시로 걸거나 내린다 (감사 로그)
create function public.set_exhibition(target uuid, on_display boolean, note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if on_display then
    update public.collections set exhibited_at = now(), exhibit_note = btrim(coalesce(note, ''))
    where id = target and is_public;
  else
    update public.collections set exhibited_at = null, exhibit_note = '' where id = target;
  end if;
  if not found then
    raise exception 'collection_not_public' using errcode = 'P0001';
  end if;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), case when on_display then 'exhibit' else 'unexhibit' end, 'collections', target,
          jsonb_build_object('note', btrim(coalesce(note, ''))));
end;
$$;
revoke all on function public.set_exhibition(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_exhibition(uuid, boolean, text) to authenticated;

-- 비공개로 바꾸면 전시에서 내린다
create function private.unexhibit_private()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_public then
    new.exhibited_at := null;
    new.exhibit_note := '';
  end if;
  return new;
end;
$$;
revoke all on function private.unexhibit_private() from public, anon, authenticated;
create trigger collections_unexhibit_private before update of is_public on public.collections
  for each row execute function private.unexhibit_private();

-- ─────────────────────────────────────────────
-- 4) 타임캡슐
-- ─────────────────────────────────────────────
alter type public.notification_kind add value if not exists 'time_capsule';

create table public.time_capsules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- 게시물이 지워져도 편지는 남는다
  post_id uuid references public.posts (id) on delete set null,
  letter text not null check (char_length(btrim(letter)) between 1 and 1000),
  open_on date not null,
  created_at timestamptz not null default now(),
  -- 열렸다고 알린 시각
  opened_at timestamptz
);
create index time_capsules_owner_idx on public.time_capsules (owner_id, open_on);
create index time_capsules_due_idx on public.time_capsules (open_on) where opened_at is null;

alter table public.time_capsules enable row level security;
revoke all on public.time_capsules from public, anon, authenticated;
-- 편지(letter)는 열린 뒤에만 my_time_capsules()로 읽는다
grant select (id, owner_id, post_id, open_on, created_at, opened_at) on public.time_capsules to authenticated;
grant delete on public.time_capsules to authenticated;
create policy "내 타임캡슐만 본다" on public.time_capsules for select to authenticated using (owner_id = (select auth.uid()));
create policy "내 타임캡슐을 지운다" on public.time_capsules for delete to authenticated using (owner_id = (select auth.uid()));

-- 묻기: 내가 올렸거나 크레딧(승인)된 사진에만, 내일부터 10년 뒤까지, 열리지 않은 것 50개까지
create function public.bury_time_capsule(post uuid, letter text, open_on date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Seoul')::date;
  new_id uuid;
begin
  if me is null then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if not private.author_active(me) then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if not private.can_collect(post) then
    raise exception 'post_not_mine' using errcode = '42501';
  end if;
  if open_on <= today or open_on > (today + interval '10 years')::date then
    raise exception 'open_on_invalid' using errcode = 'P0001';
  end if;
  if (select count(*) from public.time_capsules t where t.owner_id = me and t.opened_at is null) >= 50 then
    raise exception 'too_many_capsules' using errcode = 'P0001';
  end if;
  insert into public.time_capsules (owner_id, post_id, letter, open_on)
  values (me, post, btrim(letter), open_on)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.bury_time_capsule(uuid, text, date) from public, anon, authenticated;
grant execute on function public.bury_time_capsule(uuid, text, date) to authenticated;

-- 내 타임캡슐: 열린 것은 편지까지, 아직이면 편지는 null
create function public.my_time_capsules()
returns table (id uuid, post_id uuid, open_on date, created_at timestamptz, letter text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.post_id, t.open_on, t.created_at,
         case when t.open_on <= (now() at time zone 'Asia/Seoul')::date then t.letter end
  from public.time_capsules t
  where t.owner_id = (select auth.uid())
  order by t.open_on desc, t.created_at desc
  limit 200;
$$;
revoke all on function public.my_time_capsules() from public, anon, authenticated;
grant execute on function public.my_time_capsules() to authenticated;

-- 매일 새벽 정리 작업: 오늘 열리는 타임캡슐을 주인에게 알린다 (한 번만). 보낸 수를 돌려준다.
create function private.send_time_capsules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  sent integer;
begin
  with due as (
    update public.time_capsules t set opened_at = now()
    where t.open_on <= today and t.opened_at is null and private.author_active(t.owner_id)
    returning t.owner_id, t.post_id
  )
  insert into public.notifications (recipient_id, kind, post_id)
  select owner_id, 'time_capsule', post_id from due;
  get diagnostics sent = row_count;
  return sent;
end;
$$;
revoke all on function private.send_time_capsules() from public, anon, authenticated;
