-- 댓글 (P-04): 답글 1단계 · @멘션 알림 · 수정 · 삭제 · 신고 · 업로더 고정 1개
--  · 볼 수 있는 게시된 글에만 단다. 글이 안 보이게 되면 댓글도 안 보인다.
--  · 지우기: 쓴 사람 · 글 작성자(내 글 댓글 관리) · 운영자. 원댓글을 지우면 답글도 지운다.
--  · 운영자 · 신고 자동 조치로 가린 댓글은 쓴 사람과 운영자에게만 보인다.
--  · 알림: 내 글에 댓글 · 내 댓글에 답글 · 멘션(댓글 하나에 5명까지). 한 사람에게 한 번만.
--  · 신고는 게시물 신고와 따로 둔다 (comment_reports). 미성년자 신고나 서로 다른 3명이 신고하면 자동으로 가린다.
--  · 정지 · 읽기 전용이면 쓰고 고칠 수 없다 (block_suspended 트리거)

alter type public.notification_kind add value if not exists 'comment_added';
alter type public.notification_kind add value if not exists 'comment_replied';
alter type public.notification_kind add value if not exists 'comment_mentioned';
alter type public.notification_kind add value if not exists 'comment_hidden';

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  pinned boolean not null default false,
  hidden_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;
create index comments_author_idx on public.comments (author_id, created_at desc);
create unique index comments_one_pinned on public.comments (post_id) where pinned;

alter table public.comments enable row level security;
revoke all on public.comments from public, anon, authenticated;
grant select on public.comments to anon, authenticated;
grant insert (post_id, author_id, parent_id, body) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;
grant delete on public.comments to authenticated;

create policy "볼 수 있는 글의 댓글" on public.comments for select to anon, authenticated
  using (
    private.post_is_visible(post_id)
    and private.author_active(author_id)
    and (hidden_at is null or author_id = (select auth.uid()) or (select private.is_admin()))
  );
create policy "게시된 글에 댓글을 단다" on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.post_is_visible(post_id)
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published' and p.held_at is null)
  );
create policy "내 댓글을 고친다" on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and hidden_at is null)
  with check (author_id = (select auth.uid()));
create policy "내 댓글 · 내 글의 댓글을 지운다" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_post_author(post_id) or (select private.is_admin()));

create trigger comments_block_suspended before insert or update on public.comments
  for each row execute function private.block_suspended();

create function private.before_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.comments%rowtype;
begin
  new.body := btrim(new.body);
  if char_length(new.body) = 0 then
    raise exception 'comment_empty' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    return new;
  end if;

  -- 답글은 같은 글의 원댓글에만 (1단계)
  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if parent.id is null or parent.post_id <> new.post_id or parent.parent_id is not null then
      raise exception 'parent_invalid' using errcode = 'P0001';
    end if;
  end if;

  if (select count(*) from public.comments where author_id = new.author_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'comment_rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.comments where post_id = new.post_id) >= 2000 then
    raise exception 'comment_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger comments_rules before insert or update on public.comments
  for each row execute function private.before_comment();

-- 알림: 글 작성자 · 원댓글 작성자 · 멘션된 회원 (한 사람에게 한 번, 본인 제외)
create function private.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author uuid;
  parent_author uuid;
  notified uuid[] := array[new.author_id];
  mentioned record;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
  end if;

  if parent_author is not null and not parent_author = any (notified) then
    perform private.notify(parent_author, 'comment_replied', new.author_id, new.post_id);
    notified := notified || parent_author;
  end if;
  if post_author is not null and not post_author = any (notified) then
    perform private.notify(post_author, 'comment_added', new.author_id, new.post_id);
    notified := notified || post_author;
  end if;

  for mentioned in
    select p.id from public.profiles p
    where p.handle = any (
      select distinct lower(m[1])::extensions.citext
      from regexp_matches(new.body, '@([A-Za-z0-9_]{3,20})', 'g') as m
      limit 5
    )
      and p.deletion_requested_at is null
  loop
    if not mentioned.id = any (notified) then
      perform private.notify(mentioned.id, 'comment_mentioned', new.author_id, new.post_id);
      notified := notified || mentioned.id;
    end if;
  end loop;
  return null;
end;
$$;
create trigger comments_notify after insert on public.comments
  for each row execute function private.notify_comment();

-- 고정: 글 작성자가 원댓글 하나를 맨 위에 (다시 부르면 바꾼다, pin=false면 푼다)
create function public.pin_comment(target uuid, pin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments%rowtype;
begin
  select * into c from public.comments where id = target;
  if c.id is null or not private.is_post_author(c.post_id) then
    raise exception 'comment_not_found' using errcode = '42501';
  end if;
  if c.parent_id is not null or c.hidden_at is not null then
    raise exception 'comment_not_pinnable' using errcode = 'P0001';
  end if;
  update public.comments set pinned = false where post_id = c.post_id and pinned and id <> target;
  update public.comments set pinned = pin where id = target;
end;
$$;

-- ─────────────────────────────────────────────
-- 댓글 신고
-- ─────────────────────────────────────────────
create table public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  reason public.report_reason not null,
  detail text not null default '' check (char_length(detail) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index comment_reports_one_open on public.comment_reports (reporter_id, comment_id) where status = 'open';
create index comment_reports_open_idx on public.comment_reports (created_at) where status = 'open';
create index comment_reports_reporter_idx on public.comment_reports (reporter_id, created_at desc);

alter table public.comment_reports enable row level security;
revoke all on public.comment_reports from public, anon, authenticated;
grant select on public.comment_reports to authenticated;
grant insert (reporter_id, comment_id, reason, detail) on public.comment_reports to authenticated;

create policy "내 댓글 신고와 운영자" on public.comment_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy "볼 수 있는 남의 댓글을 신고한다" on public.comment_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and exists (select 1 from public.comments c where c.id = comment_id and c.author_id <> (select auth.uid()))
  );

create trigger comment_reports_block_suspended before insert on public.comment_reports
  for each row execute function private.block_suspended();

-- 하루 20건은 게시물 신고와 합쳐서 센다
create function private.before_comment_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     + (select count(*) from public.comment_reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger comment_reports_rate_limit before insert on public.comment_reports
  for each row execute function private.before_comment_report();

create function private.after_comment_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
begin
  select count(distinct reporter_id) into reporters
  from public.comment_reports where comment_id = new.comment_id and status = 'open';
  if new.reason::text = 'minor_safety' or reporters >= 3 then
    update public.comments set hidden_at = now(), pinned = false where id = new.comment_id and hidden_at is null;
    if found then
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (null, 'auto_hide', 'comments', new.comment_id, jsonb_build_object('reason', new.reason, 'reporters', reporters));
    end if;
  end if;
  return null;
end;
$$;
create trigger comment_reports_auto_hide after insert on public.comment_reports
  for each row execute function private.after_comment_report();

-- 처리되면 신고자에게 알림 (게시물로 연결)
create function private.notify_comment_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'open' and new.status <> 'open' then
    perform private.notify(new.reporter_id, 'report_reviewed',
      null, (select post_id from public.comments where id = new.comment_id));
  end if;
  return null;
end;
$$;
create trigger comment_reports_notify after update of status on public.comment_reports
  for each row execute function private.notify_comment_report();

-- 운영자 조치: dismiss(기각, 자동으로 가린 것도 되돌림) · hide(가림) · restore(가린 것 되돌림)
create function public.moderate_comment(target uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments%rowtype;
  open_count integer;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if decision not in ('dismiss', 'hide', 'restore') then
    raise exception 'decision_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  select * into c from public.comments where id = target;
  if c.id is null then
    raise exception 'comment_not_found' using errcode = 'P0001';
  end if;
  select count(*) into open_count from public.comment_reports where comment_id = target and status = 'open';

  if decision = 'hide' then
    update public.comments set hidden_at = coalesce(hidden_at, now()), pinned = false where id = target;
    update public.comment_reports set status = 'actioned', resolved_at = now() where comment_id = target and status = 'open';
    perform private.notify(c.author_id, 'comment_hidden', null, c.post_id);
  else
    update public.comments set hidden_at = null where id = target;
    update public.comment_reports set status = 'dismissed', resolved_at = now() where comment_id = target and status = 'open';
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'moderation', 'comments', target,
          jsonb_build_object('decision', decision, 'note', btrim(note), 'open_reports', open_count, 'body', c.body));
end;
$$;

revoke all on function private.before_comment(), private.notify_comment(), private.before_comment_report(),
  private.after_comment_report(), private.notify_comment_report() from public, anon, authenticated;
revoke all on function public.pin_comment(uuid, boolean), public.moderate_comment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.pin_comment(uuid, boolean), public.moderate_comment(uuid, text, text) to authenticated;

-- 게시물 신고도 하루 20건을 댓글 신고와 합쳐서 센다
create or replace function private.before_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     + (select count(*) from public.comment_reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
