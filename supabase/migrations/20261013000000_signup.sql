-- 가입 (S-01, 1단계: 핸들만 입력)
-- 프로필은 public.create_my_profile() 한 곳에서만 만든다.
--  · 만 14세 미만 차단 (생년월일은 확인에만 쓰고 저장하지 않음)
--  · 약관 · 개인정보 동의 기록을 같은 트랜잭션에서 남김
--  · 예약어 핸들 차단

-- 동의 기록은 공개 프로필과 분리해 비공개 스키마에 둔다 (API로 노출되지 않음)
create table private.signup_agreements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  policy_version text not null check (char_length(policy_version) between 1 and 32),
  terms_agreed_at timestamptz not null,
  privacy_agreed_at timestamptz not null,
  -- 만 14세 이상임을 확인한 시각 (생년월일 자체는 남기지 않는다)
  age_confirmed_at timestamptz not null
);
alter table private.signup_agreements enable row level security;
revoke all on private.signup_agreements from public, anon, authenticated;

-- 운영 주체를 사칭하거나 경로와 겹치는 핸들
create function private.handle_is_reserved(target text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(target) = any (array[
    'admin', 'administrator', 'root', 'system', 'staff', 'mod', 'moderator', 'operator',
    'haedam', 'official', 'support', 'help', 'notice', 'security', 'abuse', 'privacy', 'terms',
    'api', 'www', 'mail', 'auth', 'login', 'logout', 'signup', 'welcome', 'me', 'settings',
    'upload', 'explore', 'community', 'img', 'null', 'undefined', 'anonymous', 'deleted'
  ])
  or lower(target) like 'haedam%';
$$;

-- 핸들 입력 중 실시간 검사: 'ok' | 'invalid' | 'reserved' | 'taken'
create function public.handle_status(target text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target is null or target !~ '^[a-z0-9_]{3,20}$' then 'invalid'
    when private.handle_is_reserved(target) then 'reserved'
    when exists (select 1 from public.profiles where handle = target::extensions.citext) then 'taken'
    else 'ok'
  end;
$$;

create function public.create_my_profile(
  new_handle text,
  new_display_name text,
  birth_date date,
  policy_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Seoul')::date;
  display text := btrim(new_display_name);
begin
  if me is null then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = me) then
    raise exception 'profile_exists' using errcode = 'P0001';
  end if;
  if birth_date is null or birth_date < date '1900-01-01' or birth_date > today then
    raise exception 'birth_date_invalid' using errcode = 'P0001';
  end if;
  -- 만 14세 미만: 개인정보보호법상 법정대리인 동의가 필요하므로 가입을 받지 않는다
  if birth_date > (today - interval '14 years')::date then
    raise exception 'under_14' using errcode = 'P0001';
  end if;
  if policy_version is null or char_length(policy_version) not between 1 and 32 then
    raise exception 'policy_version_invalid' using errcode = 'P0001';
  end if;

  case public.handle_status(new_handle)
    when 'invalid' then raise exception 'handle_invalid' using errcode = 'P0001';
    when 'reserved' then raise exception 'handle_reserved' using errcode = 'P0001';
    when 'taken' then raise exception 'handle_taken' using errcode = 'P0001';
    else null;
  end case;

  if display is null or char_length(display) not between 1 and 40 or display ~ '[[:cntrl:]]' then
    raise exception 'display_name_invalid' using errcode = 'P0001';
  end if;

  begin
    -- 역할 · 업로드 권한은 기본값(member · false)으로만 들어간다
    insert into public.profiles (id, handle, display_name) values (me, new_handle, display);
  exception when unique_violation then
    -- 검사와 저장 사이에 다른 사람이 같은 핸들을 가져간 경우
    raise exception 'handle_taken' using errcode = 'P0001';
  end;

  insert into private.signup_agreements (user_id, policy_version, terms_agreed_at, privacy_agreed_at, age_confirmed_at)
  values (me, policy_version, now(), now(), now());
end;
$$;

revoke all on function private.handle_is_reserved(text) from public, anon, authenticated;
revoke all on function public.handle_status(text), public.create_my_profile(text, text, date, text)
  from public, anon, authenticated;
grant execute on function public.handle_status(text), public.create_my_profile(text, text, date, text)
  to authenticated;

-- 프로필을 직접 넣는 길은 닫는다 (위 함수만 사용)
revoke insert on public.profiles from authenticated;
drop policy "본인 프로필만 만든다" on public.profiles;
