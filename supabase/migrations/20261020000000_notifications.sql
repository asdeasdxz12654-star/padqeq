-- 알림 (사이트 안에서만. 푸시 · 이메일 없음)
--  · 알림은 DB 트리거만 만든다 (회원은 넣을 수 없음). 문구는 앱이 종류(kind)로 정한다.
--  · 본인이 한 일은 본인에게 알리지 않는다 (예: 내가 내 글을 숨김)
--  · 읽은 알림은 90일, 안 읽은 알림도 180일이 지나면 매일 백업 뒤 지운다

create type public.notification_kind as enum (
  'credit_requested',  -- 누군가 내 게시물이 아닌 글에 나를 크레딧으로 올림 (게시된 뒤)
  'credit_approved',   -- 내 글의 크레딧 요청을 상대가 승인
  'credit_rejected',   -- 내 글의 크레딧 요청을 상대가 거절
  'post_held',         -- 내 글이 임시 비공개됨 (신고 자동 조치 · 운영자)
  'post_released',     -- 임시 비공개가 풀림
  'post_hidden',       -- 운영자가 게시 중단
  'report_reviewed'    -- 내가 한 신고를 운영자가 검토함
);

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  actor_id uuid references public.profiles (id) on delete set null,
  post_id uuid references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_recipient_idx on public.notifications (recipient_id, id desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "내 알림만 본다" on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy "내 알림을 읽음 처리한다" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy "내 알림을 지운다" on public.notifications
  for delete to authenticated using (recipient_id = (select auth.uid()));

-- 알림 넣기 (본인이 한 일 · 받는 사람이 없으면 넣지 않음)
create function private.notify(recipient uuid, what public.notification_kind, actor uuid, post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if recipient is null or recipient = (select auth.uid()) then
    return;
  end if;
  insert into public.notifications (recipient_id, kind, actor_id, post_id) values (recipient, what, actor, post);
end;
$$;

-- 크레딧: 게시된 글에 요청이 붙거나, 초안이 게시될 때 대기 중인 요청을 알린다. 승인 · 거절은 작성자에게.
create function private.notify_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  published boolean;
begin
  select p.author_id, p.status = 'published' into author, published from public.posts p where p.id = new.post_id;
  if tg_op = 'INSERT' then
    if new.status = 'pending' and published then
      perform private.notify(new.member_id, 'credit_requested', author, new.post_id);
    end if;
  elsif old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform private.notify(author,
      case new.status when 'approved' then 'credit_approved' else 'credit_rejected' end::public.notification_kind,
      new.member_id, new.post_id);
  end if;
  return null;
end;
$$;
create trigger credits_notify
after insert or update of status on public.credits
for each row execute function private.notify_credit();

create function private.notify_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  -- 처음 게시될 때: 대기 중인 크레딧 요청
  if old.status = 'draft' and new.status = 'published' then
    for c in select member_id from public.credits where post_id = new.id and status = 'pending' and member_id is not null loop
      perform private.notify(c.member_id, 'credit_requested', new.author_id, new.id);
    end loop;
  end if;

  if old.held_at is null and new.held_at is not null then
    perform private.notify(new.author_id, 'post_held', null, new.id);
  elsif old.held_at is not null and new.held_at is null and new.status = 'published' then
    perform private.notify(new.author_id, 'post_released', null, new.id);
  end if;

  -- 작성자 본인이 숨긴 경우는 notify()가 거른다
  if old.status = 'published' and new.status = 'hidden' then
    perform private.notify(new.author_id, 'post_hidden', null, new.id);
  end if;
  return null;
end;
$$;
create trigger posts_notify
after update of status, held_at on public.posts
for each row execute function private.notify_post();

-- 신고 검토 결과: 기각인지 조치인지는 알리지 않는다. 게시물 제목은 신고자가 그 글을 볼 수 있을 때만 화면에 나온다 (RLS).
create function private.notify_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'open' and new.status <> 'open' then
    perform private.notify(new.reporter_id, 'report_reviewed', null, new.post_id);
  end if;
  return null;
end;
$$;
create trigger reports_notify
after update of status on public.reports
for each row execute function private.notify_report();

-- 오래된 알림 정리 (매일 백업 뒤 GitHub Actions가 부른다)
create function private.purge_old_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.notifications
  where (read_at is not null and created_at < now() - interval '90 days')
     or created_at < now() - interval '180 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function private.notify(uuid, public.notification_kind, uuid, uuid) from public, anon, authenticated;
revoke all on function private.notify_credit(), private.notify_post(), private.notify_report() from public, anon, authenticated;
revoke all on function private.purge_old_notifications() from public, anon, authenticated;
