-- 커뮤니티 게시판 (S-13 섭외 · 촬영 장소 · 자유 · Q&A)
--  · 섭외 게시판: 만 19세 이상 · 가입 7일 이상만 글쓰기. 지원은 메시지로 (메시지 마이그레이션). 공개 답글 없음. 마감하면 흐리게.
--  · 장소 · 자유 · Q&A: 가입한 회원 누구나 쓰고 답글을 단다.
--  · 신고는 글 · 답글 모두. 미성년자 신고나 서로 다른 3명이 신고하면 자동으로 가린다. 운영자는 moderate_board()로 처리.
--  · 정지 · 읽기 전용이면 쓰고 고칠 수 없다 (block_suspended)
--  · 성인 확인: 생년월일은 저장하지 않고 '만 19세 이상임을 확인한 시각'만 비공개로 남긴다 (본인 · DB 함수만 앎)

alter type public.notification_kind add value if not exists 'board_replied';
alter type public.notification_kind add value if not exists 'board_hidden';

-- ─────────────────────────────────────────────
-- 성인 확인
-- ─────────────────────────────────────────────
create table private.adult_confirmations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  confirmed_at timestamptz not null default now()
);
alter table private.adult_confirmations enable row level security;
revoke all on private.adult_confirmations from public, anon, authenticated;

create function private.is_adult(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.adult_confirmations where user_id = target);
$$;
revoke all on function private.is_adult(uuid) from public, anon, authenticated;
grant execute on function private.is_adult(uuid) to authenticated;

-- 본인이 성인 확인을 했는지
create function public.am_i_adult()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_adult((select auth.uid()));
$$;

-- 만 19세 이상 확인 (서울 기준 만 나이). 생년월일은 계산에만 쓰고 저장하지 않는다.
create function public.confirm_adult(birth_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if me is null or not exists (select 1 from public.profiles where id = me) then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if birth_date is null or birth_date < date '1900-01-01' or birth_date > today then
    raise exception 'birth_date_invalid' using errcode = 'P0001';
  end if;
  if birth_date > (today - interval '19 years')::date then
    return false;
  end if;
  insert into private.adult_confirmations (user_id) values (me) on conflict (user_id) do nothing;
  return true;
end;
$$;
revoke all on function public.am_i_adult(), public.confirm_adult(date) from public, anon, authenticated;
grant execute on function public.am_i_adult(), public.confirm_adult(date) to authenticated;

-- ─────────────────────────────────────────────
-- 게시판 글
-- ─────────────────────────────────────────────
create type public.board_kind as enum ('casting', 'places', 'free', 'qna');
create type public.casting_kind as enum ('model_wanted', 'photographer_wanted', 'group');
create type public.casting_terms as enum ('paid', 'tfp', 'any');

create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  board public.board_kind not null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80 and title !~ '[[:cntrl:]]'),
  body text not null check (char_length(body) between 1 and 5000),
  region text check (region is null or private.is_region(region)),
  casting_kind public.casting_kind,
  casting_terms public.casting_terms,
  shoot_on date,
  closed_at timestamptz,
  hidden_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  -- 섭외 글은 분류 · 조건 · 지역이 있어야 한다. 다른 게시판에는 없다.
  constraint casting_fields check (
    (board = 'casting') = (casting_kind is not null and casting_terms is not null)
    and (board <> 'casting' or region is not null)
  ),
  constraint places_region check (board <> 'places' or region is not null)
);
create index board_posts_list_idx on public.board_posts (board, created_at desc) where hidden_at is null;
create index board_posts_author_idx on public.board_posts (author_id, created_at desc);

alter table public.board_posts enable row level security;
revoke all on public.board_posts from public, anon, authenticated;
grant select on public.board_posts to anon, authenticated;
grant insert (board, author_id, title, body, region, casting_kind, casting_terms, shoot_on) on public.board_posts to authenticated;
grant update (title, body, region, casting_kind, casting_terms, shoot_on, closed_at) on public.board_posts to authenticated;
grant delete on public.board_posts to authenticated;

create policy "게시판 글은 누구나 본다 (가린 글은 쓴 사람 · 운영자만)" on public.board_posts for select to anon, authenticated
  using (
    private.author_active(author_id)
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_admin()))
  );
create policy "게시판에 글을 쓴다" on public.board_posts for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "내 글을 고친다" on public.board_posts for update to authenticated
  using (author_id = (select auth.uid()) and hidden_at is null) with check (author_id = (select auth.uid()));
create policy "내 글을 지운다 (운영자도)" on public.board_posts for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));

create trigger board_posts_block_suspended before insert or update on public.board_posts
  for each row execute function private.block_suspended();

create function private.before_board_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.body := btrim(new.body);
  if tg_op = 'UPDATE' then
    if new.board <> old.board then
      raise exception 'board_immutable' using errcode = 'P0001';
    end if;
    if (new.title, new.body, new.region, new.casting_kind, new.casting_terms, new.shoot_on)
       is distinct from (old.title, old.body, old.region, old.casting_kind, old.casting_terms, old.shoot_on) then
      new.edited_at := now();
    end if;
    return new;
  end if;

  if new.board = 'casting' then
    if not private.is_adult(new.author_id) then
      raise exception 'adult_required' using errcode = '42501';
    end if;
    if (select created_at from public.profiles where id = new.author_id) > now() - interval '7 days' then
      raise exception 'account_too_new' using errcode = '42501';
    end if;
  end if;
  if (select count(*) from public.board_posts where author_id = new.author_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'board_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger board_posts_rules before insert or update on public.board_posts
  for each row execute function private.before_board_post();

-- ─────────────────────────────────────────────
-- 답글 (섭외 게시판 제외)
-- ─────────────────────────────────────────────
create table public.board_replies (
  id uuid primary key default gen_random_uuid(),
  board_post_id uuid not null references public.board_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  hidden_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index board_replies_post_idx on public.board_replies (board_post_id, created_at);
create index board_replies_author_idx on public.board_replies (author_id, created_at desc);

alter table public.board_replies enable row level security;
revoke all on public.board_replies from public, anon, authenticated;
grant select on public.board_replies to anon, authenticated;
grant insert (board_post_id, author_id, body) on public.board_replies to authenticated;
grant update (body) on public.board_replies to authenticated;
grant delete on public.board_replies to authenticated;

-- 글이 보이는지 (가린 글 · 탈퇴 유예 작성자의 글은 안 보임)
create function private.board_post_is_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_posts b
    where b.id = target and private.author_active(b.author_id)
      and (b.hidden_at is null or b.author_id = (select auth.uid()) or private.is_admin())
  );
$$;
revoke all on function private.board_post_is_visible(uuid) from public, anon, authenticated;
grant execute on function private.board_post_is_visible(uuid) to anon, authenticated;

create policy "보이는 글의 답글" on public.board_replies for select to anon, authenticated
  using (
    private.board_post_is_visible(board_post_id)
    and private.author_active(author_id)
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_admin()))
  );
create policy "열린 글에 답글을 단다" on public.board_replies for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.board_posts b
      where b.id = board_post_id and b.board <> 'casting' and b.hidden_at is null and b.closed_at is null
        and private.author_active(b.author_id)
    )
  );
create policy "내 답글을 고친다" on public.board_replies for update to authenticated
  using (author_id = (select auth.uid()) and hidden_at is null) with check (author_id = (select auth.uid()));
create policy "내 답글 · 내 글의 답글을 지운다" on public.board_replies for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.board_posts b where b.id = board_post_id and b.author_id = (select auth.uid()))
    or (select private.is_admin())
  );

create trigger board_replies_block_suspended before insert or update on public.board_replies
  for each row execute function private.block_suspended();

create function private.before_board_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  if tg_op = 'UPDATE' then
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    return new;
  end if;
  if (select count(*) from public.board_replies where author_id = new.author_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'reply_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger board_replies_rules before insert or update on public.board_replies
  for each row execute function private.before_board_reply();

-- 내 글에 답글이 달리면 알림 (알림의 연결 대상: 게시판 글)
alter table public.notifications add column board_post_id uuid references public.board_posts (id) on delete cascade;

create function private.notify_board(recipient uuid, what public.notification_kind, actor uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if recipient is null or recipient = (select auth.uid()) then
    return;
  end if;
  insert into public.notifications (recipient_id, kind, actor_id, board_post_id) values (recipient, what, actor, target);
end;
$$;
revoke all on function private.notify_board(uuid, public.notification_kind, uuid, uuid) from public, anon, authenticated;

create function private.notify_board_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_board((select author_id from public.board_posts where id = new.board_post_id),
    'board_replied', new.author_id, new.board_post_id);
  return null;
end;
$$;
create trigger board_replies_notify after insert on public.board_replies
  for each row execute function private.notify_board_reply();

-- ─────────────────────────────────────────────
-- 게시판 신고
-- ─────────────────────────────────────────────
create table public.board_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  board_post_id uuid not null references public.board_posts (id) on delete cascade,
  reply_id uuid references public.board_replies (id) on delete cascade,
  reason public.report_reason not null,
  detail text not null default '' check (char_length(detail) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index board_reports_one_open on public.board_reports
  (reporter_id, board_post_id, coalesce(reply_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'open';
create index board_reports_open_idx on public.board_reports (created_at) where status = 'open';
create index board_reports_reporter_idx on public.board_reports (reporter_id, created_at desc);

alter table public.board_reports enable row level security;
revoke all on public.board_reports from public, anon, authenticated;
grant select on public.board_reports to authenticated;
grant insert (reporter_id, board_post_id, reply_id, reason, detail) on public.board_reports to authenticated;

create policy "내 게시판 신고와 운영자" on public.board_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy "볼 수 있는 남의 글 · 답글을 신고한다" on public.board_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and private.board_post_is_visible(board_post_id)
    and case
      when reply_id is null then not exists (select 1 from public.board_posts b where b.id = board_post_id and b.author_id = (select auth.uid()))
      else exists (select 1 from public.board_replies r where r.id = reply_id and r.board_post_id = board_reports.board_post_id
                   and r.author_id <> (select auth.uid()))
    end
  );

create trigger board_reports_block_suspended before insert on public.board_reports
  for each row execute function private.block_suspended();

create function private.before_board_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.board_reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger board_reports_rate_limit before insert on public.board_reports
  for each row execute function private.before_board_report();

create function private.after_board_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
begin
  select count(distinct reporter_id) into reporters from public.board_reports
  where board_post_id = new.board_post_id and reply_id is not distinct from new.reply_id and status = 'open';
  if new.reason::text = 'minor_safety' or reporters >= 3 then
    if new.reply_id is null then
      update public.board_posts set hidden_at = now() where id = new.board_post_id and hidden_at is null;
    else
      update public.board_replies set hidden_at = now() where id = new.reply_id and hidden_at is null;
    end if;
    if found then
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (null, 'auto_hide', case when new.reply_id is null then 'board_posts' else 'board_replies' end,
              coalesce(new.reply_id, new.board_post_id), jsonb_build_object('reason', new.reason, 'reporters', reporters));
    end if;
  end if;
  return null;
end;
$$;
create trigger board_reports_auto_hide after insert on public.board_reports
  for each row execute function private.after_board_report();

create function private.notify_board_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'open' and new.status <> 'open' then
    perform private.notify_board(new.reporter_id, 'report_reviewed', null, new.board_post_id);
  end if;
  return null;
end;
$$;
create trigger board_reports_notify after update of status on public.board_reports
  for each row execute function private.notify_board_report();

-- 운영자 조치 (글 또는 답글): dismiss(기각 · 자동 가림 되돌림) · hide(가림, 쓴 사람에게 알림)
create function public.moderate_board(target_post uuid, target_reply uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  open_count integer;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if decision not in ('dismiss', 'hide') then
    raise exception 'decision_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;

  if target_reply is null then
    select author_id into author from public.board_posts where id = target_post;
  else
    select author_id into author from public.board_replies where id = target_reply and board_post_id = target_post;
  end if;
  if author is null then
    raise exception 'target_not_found' using errcode = 'P0001';
  end if;
  select count(*) into open_count from public.board_reports
  where board_post_id = target_post and reply_id is not distinct from target_reply and status = 'open';

  if target_reply is null then
    update public.board_posts set hidden_at = case when decision = 'hide' then coalesce(hidden_at, now()) end where id = target_post;
  else
    update public.board_replies set hidden_at = case when decision = 'hide' then coalesce(hidden_at, now()) end where id = target_reply;
  end if;
  update public.board_reports
  set status = case when decision = 'hide' then 'actioned' else 'dismissed' end::public.report_status, resolved_at = now()
  where board_post_id = target_post and reply_id is not distinct from target_reply and status = 'open';
  if decision = 'hide' then
    perform private.notify_board(author, 'board_hidden', null, target_post);
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'moderation', case when target_reply is null then 'board_posts' else 'board_replies' end,
          coalesce(target_reply, target_post), jsonb_build_object('decision', decision, 'note', btrim(note), 'open_reports', open_count));
end;
$$;

revoke all on function private.before_board_post(), private.before_board_reply(), private.notify_board_reply(),
  private.before_board_report(), private.after_board_report(), private.notify_board_report() from public, anon, authenticated;
revoke all on function public.moderate_board(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.moderate_board(uuid, uuid, text, text) to authenticated;
