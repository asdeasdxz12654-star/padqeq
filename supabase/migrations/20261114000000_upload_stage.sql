-- 운영 단계 · 초대 코드 (A-05 ① · P-02 업로드 개방)
--  · 단계: solo(운영자만 업로드) → invite(초대 코드를 받은 회원) → open(가입한 회원 누구나)
--  · 초대 코드: 운영자가 만든다 (사용 횟수 · 기한). invite 단계에서 회원이 코드를 넣으면 업로드 권한이 생긴다.
--  · open 단계에서는 profiles.can_upload가 없어도 올릴 수 있다. 정지 · 업로드 중단이면 어느 단계든 막힌다.
--  · 운영자 업로드 권한 회수(revoke_upload)는 open 단계에서도 지킨다: 회수 기록이 있는 회원은 open에서도 못 올린다.

create type public.upload_stage as enum ('solo', 'invite', 'open');
alter table public.site_switches add column upload_stage public.upload_stage not null default 'solo';

-- 운영자가 업로드 권한을 회수한 회원 (open 단계에서도 막는다)
alter table public.profiles add column upload_revoked_at timestamptz;
revoke update (upload_revoked_at) on public.profiles from authenticated;

create or replace function private.can_upload()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.can_upload or ((select upload_stage from public.site_switches) = 'open' and p.upload_revoked_at is null))
  ) and not private.is_suspended() and not private.switch_on('uploads_closed');
$$;

-- 회원이 지금 올릴 수 있는지 (화면 표시용)
create function public.can_i_upload()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_upload();
$$;
revoke all on function public.can_i_upload() from public, anon, authenticated;
grant execute on function public.can_i_upload() to authenticated;

-- 회수 · 다시 주기를 회수 기록에도 남긴다 (sanction_member가 can_upload를 바꿀 때)
create function private.track_upload_revoke()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.can_upload is distinct from old.can_upload then
    new.upload_revoked_at := case when new.can_upload then null else now() end;
  end if;
  return new;
end;
$$;
revoke all on function private.track_upload_revoke() from public, anon, authenticated;
create trigger profiles_track_upload_revoke before update of can_upload on public.profiles
  for each row execute function private.track_upload_revoke();

-- 사진 더하기: 업로드 권한 판단을 단계까지 반영한 private.can_upload()로
create or replace function public.add_my_photos(target uuid, entries jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  entry jsonb;
  next_position integer;
  new_id uuid;
  ids uuid[] := '{}';
begin
  if me is null or not exists (
    select 1 from public.posts
    where id = target and author_id = me and status in ('published', 'hidden') and removed_at is null
  ) then
    raise exception 'post_not_editable' using errcode = '42501';
  end if;
  if not private.can_upload() then
    raise exception 'upload_not_allowed' using errcode = '42501';
  end if;
  if (select has_people from public.posts where id = target) and not private.is_admin() then
    raise exception 'people_admin_only' using errcode = '42501';
  end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) = 0 then
    raise exception 'entries_invalid' using errcode = 'P0001';
  end if;
  if (select count(*) from public.photos where post_id = target) + jsonb_array_length(entries) > 20 then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;

  select coalesce(max(position) + 1, 0) into next_position from public.photos where post_id = target;
  for entry in select * from jsonb_array_elements(entries) loop
    if (entry ->> 'seed') !~ '^[0-9a-f]{32}$' then
      raise exception 'seed_invalid' using errcode = 'P0001';
    end if;
    insert into public.photos (post_id, position, width, height, bytes, alt_text, taken_at)
    values (
      target,
      next_position,
      (entry ->> 'width')::integer,
      (entry ->> 'height')::integer,
      (entry ->> 'bytes')::integer,
      coalesce(entry ->> 'alt_text', ''),
      (entry ->> 'taken_at')::timestamptz
    )
    returning id into new_id;
    insert into private.photo_watermarks (photo_id, seed) values (new_id, decode(entry ->> 'seed', 'hex'));
    ids := ids || new_id;
    next_position := next_position + 1;
  end loop;
  return ids;
end;
$$;

-- 운영 단계 바꾸기 (운영자 · 이유 필수 · 감사 로그)
create function public.set_upload_stage(stage public.upload_stage, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before public.upload_stage;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  select upload_stage into before from public.site_switches;
  update public.site_switches s set upload_stage = set_upload_stage.stage, updated_by = (select auth.uid()), updated_at = now() where s.id;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'upload_stage', 'site_switches', null,
          jsonb_build_object('before', before, 'after', stage, 'note', btrim(note)));
end;
$$;
revoke all on function public.set_upload_stage(public.upload_stage, text) from public, anon, authenticated;
grant execute on function public.set_upload_stage(public.upload_stage, text) to authenticated;

-- ─────────────────────────────────────────────
-- 초대 코드
-- ─────────────────────────────────────────────
create table public.invite_codes (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  note text not null default '' check (char_length(note) <= 100),
  max_uses integer not null check (max_uses between 1 and 1000),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.invite_redemptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null references public.invite_codes (code) on delete cascade,
  created_at timestamptz not null default now()
);
create index invite_redemptions_code_idx on public.invite_redemptions (code);

alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;
revoke all on public.invite_codes, public.invite_redemptions from public, anon, authenticated;
grant select on public.invite_codes, public.invite_redemptions to authenticated;
create policy "운영자만 초대 코드를 본다" on public.invite_codes for select to authenticated using ((select private.is_admin()));
create policy "내 사용 기록과 운영자" on public.invite_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- 초대 코드 실패 시도 (코드 맞히기 막기: 한 시간에 10번)
create table private.invite_attempts (
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index invite_attempts_user_idx on private.invite_attempts (user_id, created_at);
alter table private.invite_attempts enable row level security;
revoke all on private.invite_attempts from public, anon, authenticated;

create function public.create_invite_code(max_uses integer, days integer, note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  bytes bytea;
  i integer;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if max_uses is null or max_uses not between 1 and 1000 or days is null or days not between 1 and 365 then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  loop
    -- uuid v4의 무작위 바이트 (6 · 8번째 바이트는 버전 표시라 건너뛴다)
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    new_code := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
      new_code := new_code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes where code = new_code);
  end loop;
  insert into public.invite_codes (code, note, max_uses, expires_at, created_by)
  values (new_code, btrim(coalesce(note, '')), create_invite_code.max_uses, now() + make_interval(days => days), (select auth.uid()));
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'invite_created', 'invite_codes', null, jsonb_build_object('code', new_code, 'max_uses', max_uses, 'days', days));
  return new_code;
end;
$$;

create function public.revoke_invite_code(target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  update public.invite_codes set revoked_at = coalesce(revoked_at, now()) where code = target;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- 회원이 초대 코드를 넣는다 (invite 단계에서만). 성공하면 업로드 권한.
-- 틀린 코드는 오류 대신 'invalid'를 돌려준다 (실패 기록이 되돌려지지 않도록)
create function public.redeem_invite_code(input text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  normalized text := upper(regexp_replace(coalesce(input, ''), '[^A-Za-z0-9]', '', 'g'));
  invite public.invite_codes%rowtype;
begin
  if me is null or not exists (select 1 from public.profiles where id = me and deletion_requested_at is null) then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if private.is_suspended() then
    raise exception 'member_suspended' using errcode = '42501';
  end if;
  if (select upload_stage from public.site_switches) <> 'invite' then
    raise exception 'invites_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = me and can_upload) then
    raise exception 'already_uploader' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = me and upload_revoked_at is not null) then
    raise exception 'upload_revoked' using errcode = '42501';
  end if;
  if (select count(*) from private.invite_attempts where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'invite_rate_limited' using errcode = 'P0001';
  end if;

  select * into invite from public.invite_codes where code = normalized for update;
  if invite.code is null or invite.revoked_at is not null or invite.expires_at < now() or invite.used_count >= invite.max_uses then
    insert into private.invite_attempts (user_id) values (me);
    return 'invalid';
  end if;

  update public.invite_codes set used_count = used_count + 1 where code = invite.code;
  insert into public.invite_redemptions (user_id, code) values (me, invite.code)
  on conflict (user_id) do update set code = excluded.code, created_at = now();
  update public.profiles set can_upload = true where id = me;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values (me, 'invite_redeemed', 'profiles', me, jsonb_build_object('code', invite.code));
  return 'ok';
end;
$$;

revoke all on function public.create_invite_code(integer, integer, text), public.revoke_invite_code(text), public.redeem_invite_code(text)
  from public, anon, authenticated;
grant execute on function public.create_invite_code(integer, integer, text), public.revoke_invite_code(text), public.redeem_invite_code(text)
  to authenticated;
