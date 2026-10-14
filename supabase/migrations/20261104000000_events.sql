-- 행사 (S-12) · 행사 캘린더 (S-17)
--  · 운영자가 등록하고, 회원은 등록을 제안한다 (승인 전까지 제안자 · 운영자만 봄). 승인하면 행사 태그가 생긴다.
--  · 행사 사진 = 그 행사 태그가 붙은 게시물
--  · 참가 예정: 나만 보거나(기본) 공개(참가자 목록 · 코스 메모). 행사 전날 새벽 정리 작업이 알림을 보낸다.
--  · 정지 · 읽기 전용이면 제안 · 참가 표시를 할 수 없다 (block_suspended)

alter type public.notification_kind add value if not exists 'event_reminder';
alter type public.notification_kind add value if not exists 'event_approved';
alter type public.notification_kind add value if not exists 'event_rejected';

create type public.event_status as enum ('official', 'proposed', 'rejected');

-- 지역 (시/도 + 온라인 · 해외)
create function private.is_region(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value = any (array['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남',
                            '전북', '전남', '경북', '경남', '제주', '온라인', '해외']);
$$;
grant execute on function private.is_region(text) to anon, authenticated;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid unique references public.tags (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'),
  starts_on date not null,
  ends_on date not null,
  venue text not null check (char_length(venue) between 1 and 80),
  region text not null check (private.is_region(region)),
  url text check (char_length(url) <= 500 and url ~ '^https://[^[:space:]]+$'),
  description text not null default '' check (char_length(description) <= 2000),
  status public.event_status not null default 'proposed',
  proposed_by uuid references public.profiles (id) on delete set null,
  review_note text check (char_length(review_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_dates check (ends_on >= starts_on and ends_on - starts_on <= 31),
  constraint official_has_tag check (status <> 'official' or tag_id is not null)
);
create index events_calendar_idx on public.events (starts_on) where status = 'official';
create index events_proposed_idx on public.events (created_at) where status = 'proposed';

-- 알림에 행사 연결
alter table public.notifications add column event_id uuid references public.events (id) on delete cascade;

create function private.notify_event(recipient uuid, what public.notification_kind, target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if recipient is null or recipient = (select auth.uid()) then
    return;
  end if;
  insert into public.notifications (recipient_id, kind, event_id) values (recipient, what, target);
end;
$$;
revoke all on function private.notify_event(uuid, public.notification_kind, uuid) from public, anon, authenticated;

alter table public.events enable row level security;
revoke all on public.events from public, anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert (name, starts_on, ends_on, venue, region, url, description, proposed_by) on public.events to authenticated;

create policy "공식 행사 · 내 제안 · 운영자" on public.events for select to anon, authenticated
  using (status = 'official' or proposed_by = (select auth.uid()) or (select private.is_admin()));
create policy "회원은 행사를 제안한다" on public.events for insert to authenticated
  with check (proposed_by = (select auth.uid()) and status = 'proposed' and tag_id is null);

create trigger events_block_suspended before insert on public.events
  for each row execute function private.block_suspended();

create function private.before_event_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.venue := btrim(new.venue);
  new.description := btrim(new.description);
  if (select count(*) from public.events where proposed_by = new.proposed_by and status = 'proposed') >= 5 then
    raise exception 'event_proposal_limit' using errcode = 'P0001';
  end if;
  if new.ends_on < (now() at time zone 'Asia/Seoul')::date then
    raise exception 'event_past' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger events_proposal_rules before insert on public.events
  for each row when (new.status = 'proposed') execute function private.before_event_proposal();

-- 운영자: 행사 등록 · 고치기 · 제안 승인 (target이 null이면 새로). 행사 태그가 없으면 만든다(같은 주소의 행사 태그가 있으면 그걸 쓴다).
create function public.save_event(
  target uuid,
  event_name text,
  event_starts date,
  event_ends date,
  event_venue text,
  event_region text,
  event_url text,
  event_description text,
  tag_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row_id uuid := target;
  existing public.events%rowtype;
  tag uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if target is not null then
    select * into existing from public.events where id = target for update;
    if existing.id is null then
      raise exception 'event_not_found' using errcode = 'P0001';
    end if;
  end if;

  tag := existing.tag_id;
  if tag is null then
    select id into tag from public.tags where slug = tag_slug and kind = 'event';
    if tag is null then
      insert into public.tags (kind, slug, name, status, created_by)
      values ('event', tag_slug, left(btrim(event_name), 60), 'official', me)
      returning id into tag;
    end if;
  end if;

  if row_id is null then
    insert into public.events (tag_id, name, starts_on, ends_on, venue, region, url, description, status, proposed_by)
    values (tag, btrim(event_name), event_starts, event_ends, btrim(event_venue), event_region, nullif(btrim(event_url), ''),
            btrim(coalesce(event_description, '')), 'official', me)
    returning id into row_id;
  else
    update public.events
    set tag_id = tag, name = btrim(event_name), starts_on = event_starts, ends_on = event_ends, venue = btrim(event_venue),
        region = event_region, url = nullif(btrim(event_url), ''), description = btrim(coalesce(event_description, '')),
        status = 'official', review_note = null, updated_at = now()
    where id = row_id;
    if existing.status = 'proposed' then
      perform private.notify_event(existing.proposed_by, 'event_approved', row_id);
    end if;
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values (me, case when target is null then 'event_created' when existing.status = 'proposed' then 'event_approved' else 'event_updated' end,
          'events', row_id, jsonb_build_object('name', btrim(event_name)));
  return row_id;
end;
$$;

create function public.reject_event(target uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposer uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 300 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  update public.events set status = 'rejected', review_note = btrim(note), updated_at = now()
  where id = target and status = 'proposed'
  returning proposed_by into proposer;
  if not found then
    raise exception 'event_not_proposed' using errcode = 'P0001';
  end if;
  perform private.notify_event(proposer, 'event_rejected', target);
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'event_rejected', 'events', target, jsonb_build_object('note', btrim(note)));
end;
$$;

-- 운영자: 행사 지우기 (태그 · 사진은 남는다)
create policy "운영자가 행사를 지운다" on public.events for delete to authenticated using ((select private.is_admin()));
grant delete on public.events to authenticated;

-- ─────────────────────────────────────────────
-- 참가 예정
-- ─────────────────────────────────────────────
create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_public boolean not null default false,
  -- 현장에서 찾기용 코스 메모 (예: 원신 · 라이덴 쇼군). 공개했을 때만 남에게 보인다.
  cos_note text not null default '' check (char_length(cos_note) <= 100),
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_attendees_user_idx on public.event_attendees (user_id, created_at desc);

alter table public.event_attendees enable row level security;
revoke all on public.event_attendees from public, anon, authenticated;
grant select on public.event_attendees to anon, authenticated;
grant insert (event_id, user_id, is_public, cos_note) on public.event_attendees to authenticated;
grant update (is_public, cos_note) on public.event_attendees to authenticated;
grant delete on public.event_attendees to authenticated;

create policy "내 참가 · 공개한 참가자" on public.event_attendees for select to anon, authenticated
  using (user_id = (select auth.uid()) or (is_public and private.author_active(user_id)));
create policy "다가오는 공식 행사에 참가 표시를 한다" on public.event_attendees for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'official' and e.ends_on >= (now() at time zone 'Asia/Seoul')::date
    )
  );
create policy "내 참가를 고친다" on public.event_attendees for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "내 참가를 취소한다" on public.event_attendees for delete to authenticated
  using (user_id = (select auth.uid()));

create trigger event_attendees_block_suspended before insert or update on public.event_attendees
  for each row execute function private.block_suspended();

create function private.before_attend()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.cos_note := btrim(new.cos_note);
  if tg_op = 'INSERT' and (
    select count(*) from public.event_attendees a join public.events e on e.id = a.event_id
    where a.user_id = new.user_id and e.ends_on >= (now() at time zone 'Asia/Seoul')::date
  ) >= 200 then
    raise exception 'attend_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger event_attendees_rules before insert or update on public.event_attendees
  for each row execute function private.before_attend();

-- 참가 예정 수 (비공개 참가자도 센다, 누구인지는 드러내지 않음)
create function public.event_attendee_counts(ids uuid[])
returns table (event_id uuid, attendees integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.event_id, count(*)::integer
  from public.event_attendees a
  join public.events e on e.id = a.event_id and e.status = 'official'
  where a.event_id = any (ids[1:200]) and private.author_active(a.user_id)
  group by a.event_id;
$$;

-- 행사 전날 알림 (매일 새벽 정리 작업, DB 관리자 연결 전용). 보낸 수를 돌려준다.
create function private.send_event_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tomorrow date := (now() at time zone 'Asia/Seoul')::date + 1;
  sent integer;
begin
  with due as (
    update public.event_attendees a set reminded_at = now()
    from public.events e
    where e.id = a.event_id and e.status = 'official' and e.starts_on = tomorrow and a.reminded_at is null
    returning a.user_id, a.event_id
  )
  insert into public.notifications (recipient_id, kind, event_id)
  select user_id, 'event_reminder', event_id from due;
  get diagnostics sent = row_count;
  return sent;
end;
$$;

revoke all on function private.before_event_proposal(), private.before_attend(), private.send_event_reminders()
  from public, anon, authenticated;
revoke all on function public.save_event(uuid, text, date, date, text, text, text, text, text), public.reject_event(uuid, text),
  public.event_attendee_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.save_event(uuid, text, date, date, text, text, text, text, text), public.reject_event(uuid, text)
  to authenticated;
grant execute on function public.event_attendee_counts(uuid[]) to anon, authenticated;
