-- 대량 업로드 (A-02 · 한 번에 500장)
--  · 지금까지는 변환본을 게시 전까지 브라우저 메모리에 들고 있어 한 번에 100장이 한계였다
--  · 이제 사진마다 변환이 끝나면 바로 "업로드 자리"(upload_slots)를 받아 R2에 올리고 메모리를 비운다
--  · 게시할 때 초안의 사진 행에 자리의 저장 위치를 옮겨 붙인다 (attach_upload_slots). 크기 · 용량이 같아야 한다
--  · 자리는 본인만 보고, 함수로만 만들고 지운다. 3일 넘게 쓰지 않은 자리는 지우고 파일도 정리 대상으로 넘긴다
--  · 한 사람이 들고 있을 수 있는 자리는 500개. 운영자가 아니면 이번 달 업로드 한도도 미리 확인한다

create table public.upload_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  storage_key text not null unique default ('p/' || replace(gen_random_uuid()::text, '-', '')) check (storage_key ~ '^p/[0-9a-f]{32}$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes integer not null check (bytes > 0),
  created_at timestamptz not null default now(),
  -- 사진 행과 같은 기준 (긴 변 4000px · 8MB, 파노라마 짧은 변 2000px · 긴 변 16000px · 12MB)
  constraint upload_slot_size_rules check (
    case
      when greatest(width, height)::numeric / least(width, height) > 2.5
        then least(width, height) <= 2000 and greatest(width, height) <= 16000 and bytes <= 12 * 1024 * 1024
      else greatest(width, height) <= 4000 and bytes <= 8 * 1024 * 1024
    end
  )
);
create index upload_slots_owner_idx on public.upload_slots (owner_id, created_at);

alter table public.upload_slots enable row level security;
revoke all on public.upload_slots from public, anon, authenticated;
grant select on public.upload_slots to authenticated;
create policy "내 업로드 자리" on public.upload_slots for select to authenticated using (owner_id = (select auth.uid()));

-- 자리가 지워지면 파일 위치를 정리 대상으로 (사진에 붙은 자리는 storage_trash_due가 다시 뺀다)
create trigger upload_slots_queue_storage_trash
after delete on public.upload_slots
referencing old table as old_rows
for each statement execute function private.queue_storage_trash();

-- 자리 받기 (사진 한 장)
create function public.reserve_upload_slot(width integer, height integer, bytes integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  slot uuid;
begin
  if me is null or not private.can_upload() then
    raise exception 'upload_not_allowed' using errcode = '42501';
  end if;
  if private.switch_on('read_only') then
    raise exception 'site_read_only' using errcode = '42501';
  end if;
  if (select count(*) from public.upload_slots where owner_id = me) >= 500 then
    raise exception 'too_many_slots' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = me and role = 'admin')
     and (select count(*) from public.photos ph join public.posts p on p.id = ph.post_id
          where p.author_id = me and ph.created_at >= month_start)
       + (select count(*) from public.upload_slots where owner_id = me)
       >= private.limit_value('monthly_upload_photos', 300) then
    raise exception 'monthly_upload_limit' using errcode = 'P0001';
  end if;
  insert into public.upload_slots (owner_id, width, height, bytes)
  values (me, reserve_upload_slot.width, reserve_upload_slot.height, reserve_upload_slot.bytes)
  returning id into slot;
  return slot;
end;
$$;
revoke all on function public.reserve_upload_slot(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_upload_slot(integer, integer, integer) to authenticated;

-- 초안의 사진 행에 자리를 붙인다: entries = [{photo_id, slot_id}]
create function public.attach_upload_slots(target_post uuid, entries jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  e jsonb;
  ph public.photos%rowtype;
  s public.upload_slots%rowtype;
  done integer := 0;
begin
  if me is null or not exists (
    select 1 from public.posts where id = target_post and author_id = me and status = 'draft'
  ) then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) not between 1 and 20 then
    raise exception 'entries_invalid' using errcode = 'P0001';
  end if;
  for e in select * from jsonb_array_elements(entries) loop
    select * into ph from public.photos where id = (e ->> 'photo_id')::uuid and post_id = target_post;
    select * into s from public.upload_slots where id = (e ->> 'slot_id')::uuid and owner_id = me for update;
    if ph.id is null or s.id is null then
      raise exception 'slot_not_found' using errcode = 'P0001';
    end if;
    if (ph.width, ph.height, ph.bytes) is distinct from (s.width, s.height, s.bytes) then
      raise exception 'slot_mismatch' using errcode = 'P0001';
    end if;
    delete from public.upload_slots where id = s.id;
    update public.photos set storage_key = s.storage_key where id = ph.id;
    delete from private.storage_trash where storage_key = s.storage_key;
    done := done + 1;
  end loop;
  return done;
end;
$$;
revoke all on function public.attach_upload_slots(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.attach_upload_slots(uuid, jsonb) to authenticated;

-- 쓰지 않을 자리 지우기 (사진을 빼거나 업로드를 그만둘 때)
create function public.discard_upload_slots(ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.upload_slots
    where owner_id = (select auth.uid()) and id = any (ids[1:500])
    returning 1
  )
  select count(*)::integer from gone;
$$;
revoke all on function public.discard_upload_slots(uuid[]) from public, anon, authenticated;
grant execute on function public.discard_upload_slots(uuid[]) to authenticated;

-- 오래된 자리 정리 (매일 백업 작업). 지운 수를 돌려준다.
create function private.purge_stale_upload_slots(age interval default interval '3 days')
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.upload_slots where created_at < now() - age returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function private.purge_stale_upload_slots(interval) from public, anon, authenticated;

-- 이번 달 업로드 안내에도 들고 있는 자리를 센다
create or replace function public.my_upload_quota()
returns table (used integer, quota integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::integer from public.photos ph join public.posts p on p.id = ph.post_id
          where p.author_id = (select auth.uid())
            and ph.created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
         + (select count(*)::integer from public.upload_slots where owner_id = (select auth.uid())),
         private.limit_value('monthly_upload_photos', 300);
$$;
