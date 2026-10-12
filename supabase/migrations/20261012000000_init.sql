-- 해담 초기 스키마 (1단계: 운영자 단독 업로드)
-- 원칙: 모든 테이블 RLS 켜기 · 기본 거부 · 필요한 것만 정책으로 허용

create extension if not exists citext with schema extensions;

-- 내부 함수용 스키마. API(PostgREST)에 노출되지 않는다.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- RLS 정책이 private의 판별 함수를 부르므로 사용 권한만 준다 (API로는 노출되지 않음)
grant usage on schema private to anon, authenticated;

-- ─────────────────────────────────────────────
-- 타입
-- ─────────────────────────────────────────────
create type public.member_role as enum ('member', 'admin');
create type public.post_category as enum ('cosplay', 'model', 'landscape', 'other');
create type public.post_status as enum ('draft', 'published', 'hidden');
create type public.credit_role as enum ('cosplayer', 'model', 'photographer', 'retoucher', 'other');
create type public.credit_status as enum ('pending', 'approved', 'rejected', 'external');
create type public.report_reason as enum ('portrait_rights', 'copyright', 'minor_safety', 'sexual', 'spam', 'other');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

-- ─────────────────────────────────────────────
-- 회원
-- ─────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle extensions.citext not null unique
    check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 300),
  role public.member_role not null default 'member',
  -- 1단계는 운영자만, 2단계부터 초대받은 회원만 true
  can_upload boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 게시물 · 사진
-- ─────────────────────────────────────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 2000),
  category public.post_category not null,
  status public.post_status not null default 'draft',
  -- 연도 칩 기준: EXIF 촬영일 → 직접 입력 → 게시일 순으로 정해 저장
  shot_year smallint not null check (shot_year between 1990 and 2100),
  shot_on date,
  -- 사람이 나오는 사진이면 촬영 동의 기록이 있어야 게시 가능
  has_people boolean not null default true,
  -- '노출 주의'는 성인 인증 봉인 결정(2026-10-12)에 따라 막아 둔다
  sensitive boolean not null default false
    constraint sensitive_sealed check (sensitive = false),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_feed_idx on public.posts (shot_year desc, published_at desc) where status = 'published';
create index posts_author_idx on public.posts (author_id, created_at desc);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  position smallint not null check (position between 0 and 19),
  -- R2 객체 키 접두사. 실제 파일: {key}/4000.avif, 2560.avif, 1200.avif, 400.avif, 1600.jpg
  storage_key text not null unique,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes integer not null check (bytes > 0),
  is_panorama boolean generated always as (
    greatest(width, height)::numeric / least(width, height) > 2.5
  ) stored,
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, position),
  -- 업로드 기준: 일반 긴 변 4000px · 8MB, 파노라마 짧은 변 2000px · 긴 변 16000px · 12MB
  constraint photo_size_rules check (
    case
      when greatest(width, height)::numeric / least(width, height) > 2.5
        then least(width, height) <= 2000 and greatest(width, height) <= 16000 and bytes <= 12 * 1024 * 1024
      else greatest(width, height) <= 4000 and bytes <= 8 * 1024 * 1024
    end
  )
);

-- ─────────────────────────────────────────────
-- 크레딧 · 촬영 동의 기록
-- ─────────────────────────────────────────────
create table public.credits (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  role public.credit_role not null,
  member_id uuid references public.profiles (id) on delete set null,
  external_label text check (char_length(external_label) <= 60),
  external_url text check (external_url ~ '^https://'),
  status public.credit_status not null,
  created_at timestamptz not null default now(),
  -- 회원 크레딧은 승인 절차, 외부 표기는 이름(또는 링크)만
  constraint credit_target check (
    (member_id is not null and status in ('pending', 'approved', 'rejected'))
    or (member_id is null and status = 'external' and external_label is not null)
  )
);
create index credits_post_idx on public.credits (post_id);
create index credits_member_idx on public.credits (member_id) where member_id is not null;

-- 비공개. 운영자만 열람한다.
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete restrict,
  subject_label text not null check (char_length(subject_label) between 1 and 60),
  consented_on date not null,
  -- 동의서 사본(비공개 R2 키). 없으면 구두 동의 메모로 대신한다.
  evidence_key text,
  note text not null default '' check (char_length(note) <= 500),
  has_minor boolean not null default false,
  guardian_consent boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint minor_needs_guardian check (not has_minor or guardian_consent)
);
create index consent_post_idx on public.consent_records (post_id);

-- ─────────────────────────────────────────────
-- 신고 · 감사 로그
-- ─────────────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  reason public.report_reason not null,
  detail text not null default '' check (char_length(detail) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_open_idx on public.reports (created_at) where status = 'open';

create table private.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_table text not null,
  target_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 함수 (security definer는 search_path를 비워 하이재킹 방지)
-- ─────────────────────────────────────────────
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create function private.can_upload()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and can_upload
  );
$$;

create function private.post_is_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = target
      and (p.status = 'published' or p.author_id = (select auth.uid()) or private.is_admin())
  );
$$;

create function private.is_post_author(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.posts where id = target and author_id = (select auth.uid()));
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin(), private.post_is_visible(uuid), private.is_post_author(uuid)
  to anon, authenticated;
grant execute on function private.can_upload() to authenticated;

-- 게시 규칙: 사진 1장 이상, 사람이 나오면 촬영 동의 기록 필수
create function private.enforce_publish_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not exists (select 1 from public.photos where post_id = new.id) then
      raise exception '사진이 없는 게시물은 게시할 수 없습니다' using errcode = 'check_violation';
    end if;
    if new.has_people and not exists (select 1 from public.consent_records where post_id = new.id) then
      raise exception '촬영 동의 기록이 없으면 게시할 수 없습니다' using errcode = 'check_violation';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger posts_publish_rules
before insert or update on public.posts
for each row execute function private.enforce_publish_rules();

-- 운영자 조치 기록
create function private.audit_post_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into private.audit_log (actor_id, action, target_table, target_id, detail)
    values (auth.uid(), 'post_status', 'posts', new.id,
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

create trigger posts_audit_status
after update on public.posts
for each row execute function private.audit_post_status();

-- 연도 칩: 게시된 게시물이 있는 촬영 연도 목록
create function public.published_shot_years()
returns table (year smallint, post_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select shot_year, count(*)
  from public.posts
  where status = 'published'
  group by shot_year
  order by shot_year desc;
$$;

-- ─────────────────────────────────────────────
-- 권한: 테이블 단위로 최소한만 열고, 행 단위는 RLS로
-- ─────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.photos enable row level security;
alter table public.credits enable row level security;
alter table public.consent_records enable row level security;
alter table public.reports enable row level security;
alter table private.audit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;
-- 앞으로 만들 테이블도 기본은 아무 권한 없이 시작
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

grant select on public.profiles, public.posts, public.photos, public.credits to anon, authenticated;
-- 가입 시 프로필 생성: 역할·업로드 권한 열은 넣을 수 없다 (기본값 member · false)
grant insert (id, handle, display_name, bio) on public.profiles to authenticated;
grant update (display_name, bio) on public.profiles to authenticated;
grant insert, update, delete on public.posts, public.photos to authenticated;
grant insert, delete on public.credits to authenticated;
-- 크레딧 승인·거절: 상태 열만 바꿀 수 있다
grant update (status) on public.credits to authenticated;
grant select, insert on public.consent_records to authenticated;
grant select, insert on public.reports to authenticated;
grant update (status, resolved_at) on public.reports to authenticated;
grant execute on function public.published_shot_years() to anon, authenticated;

-- profiles
create policy "프로필은 누구나 본다" on public.profiles
  for select to anon, authenticated using (true);
create policy "본인 프로필만 만든다" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "본인 프로필만 고친다" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- posts
create policy "게시된 글 · 내 글 · 운영자" on public.posts
  for select to anon, authenticated
  using (status = 'published' or author_id = (select auth.uid()) or (select private.is_admin()));
create policy "업로드 권한자만 쓴다" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.can_upload()));
create policy "작성자 또는 운영자가 고친다" on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()))
  with check (author_id = (select auth.uid()) or (select private.is_admin()));
create policy "작성자 또는 운영자가 지운다" on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));

-- photos
create policy "보이는 게시물의 사진만" on public.photos
  for select to anon, authenticated using (private.post_is_visible(post_id));
create policy "작성자가 사진을 넣는다" on public.photos
  for insert to authenticated with check (private.is_post_author(post_id));
create policy "작성자가 사진을 고친다" on public.photos
  for update to authenticated
  using (private.is_post_author(post_id)) with check (private.is_post_author(post_id));
create policy "작성자 또는 운영자가 사진을 지운다" on public.photos
  for delete to authenticated
  using (private.is_post_author(post_id) or (select private.is_admin()));

-- credits: 승인됐거나 외부 표기인 것만 공개. 당사자·작성자는 대기 중인 것도 본다.
create policy "공개 크레딧과 내 관련 크레딧" on public.credits
  for select to anon, authenticated
  using (
    private.post_is_visible(post_id) and (
      status in ('approved', 'external')
      or member_id = (select auth.uid())
      or private.is_post_author(post_id)
    )
  );
create policy "작성자가 크레딧을 요청한다" on public.credits
  for insert to authenticated
  with check (private.is_post_author(post_id) and status in ('pending', 'external'));
create policy "크레딧 당사자만 승인·거절한다" on public.credits
  for update to authenticated
  using (member_id = (select auth.uid()) and status = 'pending')
  with check (member_id = (select auth.uid()) and status in ('approved', 'rejected'));
create policy "작성자 또는 당사자가 크레딧을 뺀다" on public.credits
  for delete to authenticated
  using (private.is_post_author(post_id) or member_id = (select auth.uid()));

-- consent_records: 운영자만. 수정·삭제는 없음(기록 보존).
create policy "운영자만 본다" on public.consent_records
  for select to authenticated using ((select private.is_admin()));
create policy "운영자만 남긴다" on public.consent_records
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));

-- reports
create policy "내 신고와 운영자" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy "회원은 신고할 수 있다" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy "운영자가 신고를 처리한다" on public.reports
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- audit_log: 정책 없음 → API로는 아무도 못 본다 (DB 콘솔에서만)
