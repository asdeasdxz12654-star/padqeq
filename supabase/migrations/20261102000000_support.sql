-- 고객센터 (S-20) · 긴급 스위치 (A-05)
--  · 공지: 운영자만 쓰고 누구나 본다. 점검 공지는 점검 시작 24시간 전부터 모든 화면 위에 띄운다.
--  · 1:1 문의: 회원이 쓰고 본인 · 운영자만 본다. 답변은 answer_inquiry()로만, 답하면 알림.
--    한 번에 열린 문의 5건 · 하루 10건까지. 정지 중에도 문의는 할 수 있다(이의 제기 통로).
--  · 긴급 스위치(한 행): 읽기 전용 · 가입 중단 · 업로드 중단 + 안내 문구. 운영자는 막히지 않는다.
--    막는 일은 트리거로 한다 (security definer 함수를 거쳐도 똑같이 막힘)

alter type public.notification_kind add value if not exists 'inquiry_answered';

-- ─────────────────────────────────────────────
-- 공지
-- ─────────────────────────────────────────────
create type public.notice_category as enum ('maintenance', 'policy', 'news');

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  category public.notice_category not null,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  -- 점검 시작 시각 (점검 공지만). 이 시각 24시간 전부터 배너로 알린다.
  maintenance_at timestamptz,
  pinned boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_time check ((category = 'maintenance') = (maintenance_at is not null))
);
create index notices_list_idx on public.notices (pinned desc, published_at desc);

alter table public.notices enable row level security;
revoke all on public.notices from public, anon, authenticated;
grant select on public.notices to anon, authenticated;
grant insert (category, title, body, maintenance_at, pinned, created_by) on public.notices to authenticated;
grant update (category, title, body, maintenance_at, pinned, updated_at) on public.notices to authenticated;
grant delete on public.notices to authenticated;

create policy "공지는 누구나 본다" on public.notices for select to anon, authenticated using (true);
create policy "운영자가 공지를 쓴다" on public.notices for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy "운영자가 공지를 고친다" on public.notices for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "운영자가 공지를 지운다" on public.notices for delete to authenticated
  using ((select private.is_admin()));

-- ─────────────────────────────────────────────
-- 1:1 문의
-- ─────────────────────────────────────────────
create type public.inquiry_category as enum ('account', 'upload', 'credit', 'report', 'other');
create type public.inquiry_status as enum ('open', 'answered');

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  category public.inquiry_category not null,
  body text not null check (char_length(btrim(body)) between 5 and 2000),
  -- 오류 화면에서 넘어온 오류 번호 (운영자가 로그에서 찾는 데 쓴다)
  error_ref text check (error_ref ~ '^[A-Za-z0-9_-]{1,64}$'),
  status public.inquiry_status not null default 'open',
  answer text check (answer is null or char_length(btrim(answer)) between 1 and 3000),
  answered_by uuid references public.profiles (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint answered_has_answer check ((status = 'answered') = (answer is not null and answered_at is not null))
);
create index inquiries_author_idx on public.inquiries (author_id, created_at desc);
create index inquiries_open_idx on public.inquiries (created_at) where status = 'open';

alter table public.inquiries enable row level security;
revoke all on public.inquiries from public, anon, authenticated;
grant select on public.inquiries to authenticated;
grant insert (author_id, category, body, error_ref) on public.inquiries to authenticated;

create policy "내 문의와 운영자" on public.inquiries for select to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));
create policy "내 문의를 남긴다" on public.inquiries for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'open');

create function private.before_inquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  if (select count(*) from public.inquiries where author_id = new.author_id and status = 'open') >= 5 then
    raise exception 'inquiry_open_limit' using errcode = 'P0001';
  end if;
  if (select count(*) from public.inquiries
      where author_id = new.author_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'inquiry_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger inquiries_rules before insert on public.inquiries
  for each row execute function private.before_inquiry();

create function public.answer_inquiry(target uuid, reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if reply is null or char_length(btrim(reply)) not between 1 and 3000 then
    raise exception 'answer_required' using errcode = 'P0001';
  end if;
  -- 답변을 고칠 수도 있다 (이미 답한 문의에 다시 답하면 바꾼다)
  update public.inquiries
  set status = 'answered', answer = btrim(reply), answered_by = (select auth.uid()), answered_at = now()
  where id = target
  returning author_id into author;
  if author is null then
    raise exception 'inquiry_not_found' using errcode = 'P0001';
  end if;
  perform private.notify(author, 'inquiry_answered', null, null);
end;
$$;

revoke all on function private.before_inquiry() from public, anon, authenticated;
revoke all on function public.answer_inquiry(uuid, text) from public, anon, authenticated;
grant execute on function public.answer_inquiry(uuid, text) to authenticated;

-- ─────────────────────────────────────────────
-- 긴급 스위치
-- ─────────────────────────────────────────────
create table public.site_switches (
  id boolean primary key default true check (id),
  read_only boolean not null default false,
  signup_closed boolean not null default false,
  uploads_closed boolean not null default false,
  -- 모든 화면 위 안내 문구 (비우면 기본 문구)
  message text not null default '' check (char_length(message) <= 200),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.site_switches (id) values (true);

alter table public.site_switches enable row level security;
revoke all on public.site_switches from public, anon, authenticated;
grant select on public.site_switches to anon, authenticated;
create policy "스위치는 누구나 본다" on public.site_switches for select to anon, authenticated using (true);

create function public.set_site_switches(read_only boolean, signup_closed boolean, uploads_closed boolean, message text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before jsonb;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if read_only is null or signup_closed is null or uploads_closed is null
     or message is null or char_length(btrim(message)) > 200 then
    raise exception 'switches_invalid' using errcode = 'P0001';
  end if;
  select to_jsonb(s) - 'id' - 'updated_by' - 'updated_at' into before from public.site_switches s;
  update public.site_switches s
  set read_only = set_site_switches.read_only,
      signup_closed = set_site_switches.signup_closed,
      uploads_closed = set_site_switches.uploads_closed,
      message = btrim(set_site_switches.message),
      updated_by = (select auth.uid()),
      updated_at = now()
  where s.id;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'site_switches', 'site_switches', null,
          jsonb_build_object('before', before, 'note', btrim(note),
            'after', jsonb_build_object('read_only', read_only, 'signup_closed', signup_closed,
                                        'uploads_closed', uploads_closed, 'message', btrim(message))));
end;
$$;
revoke all on function public.set_site_switches(boolean, boolean, boolean, text, text) from public, anon, authenticated;
grant execute on function public.set_site_switches(boolean, boolean, boolean, text, text) to authenticated;

-- 스위치 판별 (운영자는 항상 false)
create function private.switch_on(what text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case what
      when 'read_only' then s.read_only
      when 'signup_closed' then s.signup_closed
      when 'uploads_closed' then s.uploads_closed or s.read_only
    end
    from public.site_switches s
  ), false) and (select auth.uid()) is not null and not private.is_admin();
$$;
revoke all on function private.switch_on(text) from public, anon, authenticated;
grant execute on function private.switch_on(text) to authenticated;

-- 정지 · 읽기 전용: 남에게 보이는 것을 만들거나 고치는 일을 막는 트리거 (회원 제재 마이그레이션의 트리거를 그대로 쓴다)
create or replace function private.block_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_suspended() then
    raise exception 'member_suspended' using errcode = '42501';
  end if;
  if private.switch_on('read_only') then
    raise exception 'site_read_only' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 업로드 중단: 새 게시물 · 사진
create function private.block_closed_uploads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.switch_on('uploads_closed') then
    raise exception 'uploads_closed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.block_closed_uploads() from public, anon, authenticated;
create trigger posts_block_closed_uploads before insert on public.posts
  for each row execute function private.block_closed_uploads();
create trigger photos_block_closed_uploads before insert on public.photos
  for each row execute function private.block_closed_uploads();

-- 가입 중단: create_my_profile이 넣는 프로필
create function private.block_closed_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.switch_on('signup_closed') or private.switch_on('read_only') then
    raise exception 'signup_closed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.block_closed_signup() from public, anon, authenticated;
create trigger profiles_block_closed_signup before insert on public.profiles
  for each row execute function private.block_closed_signup();

-- 읽기 전용 중에는 문의도 남길 수 있게 둔다 (장애 신고 통로). 업로드 권한 판별에도 반영.
create or replace function private.can_upload()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and can_upload
  ) and not private.is_suspended() and not private.switch_on('uploads_closed');
$$;
