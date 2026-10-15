-- 크레딧 자동 승인 (S-10 ③) · 연말 결산 알림 (S-18 ⑤)
--
-- 크레딧 자동 승인
--  · 기본은 꺼짐. 켜도 내가 팔로우하는 회원이 태그했을 때만 자동으로 승인한다 (모르는 계정의 태그는 늘 직접 승인)
--  · 요청이 실제로 가는 순간에 판단한다: 게시된 글에 붙을 때 · 초안이 게시될 때
--  · 자동 승인되면 나에게 '자동 승인했어요' 알림 (원하지 않으면 게시물에서 언제든 뺄 수 있다)
--  · 노출 주의 게시물은 아직 봉인 상태라 따로 막지 않는다 (열 때 함께 제외할 것)
--
-- 연말 결산 알림
--  · 12월 8일(둘째 주)부터 연말까지, 올해 찍은 게시물이 있거나 크레딧된 회원에게 '나의 OOOO' 안내를 한 번
--  · 'N년 전 오늘' 알림을 끈 회원 · 탈퇴 유예 중인 회원에게는 보내지 않는다. 매일 백업 작업이 부른다.

alter type public.notification_kind add value if not exists 'credit_auto_approved';
alter type public.notification_kind add value if not exists 'year_review';

alter table public.profiles add column credit_auto_approve boolean not null default false;
grant update (credit_auto_approve) on public.profiles to authenticated;

-- 이 회원(member)이 이 업로더(author)의 태그를 자동으로 승인하는가
create function private.credit_auto_approves(member uuid, author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select member is not null and author is not null and member <> author
    and exists (select 1 from public.profiles where id = member and credit_auto_approve and deletion_requested_at is null)
    and exists (select 1 from public.member_follows where follower_id = member and followee_id = author);
$$;
revoke all on function private.credit_auto_approves(uuid, uuid) from public, anon, authenticated;

-- 요청을 보내거나, 자동 승인이면 바로 승인하고 당사자에게 알린다
create function private.request_or_auto_approve(credit uuid, member uuid, author uuid, post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.credit_auto_approves(member, author) then
    update public.credits set status = 'approved' where id = credit and status = 'pending';
    perform private.notify(member, 'credit_auto_approved'::text::public.notification_kind, author, post);
  else
    perform private.notify(member, 'credit_requested', author, post);
  end if;
end;
$$;
revoke all on function private.request_or_auto_approve(uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.notify_credit()
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
      perform private.request_or_auto_approve(new.id, new.member_id, author, new.post_id);
    end if;
  elsif old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform private.notify(author,
      case new.status when 'approved' then 'credit_approved' else 'credit_rejected' end::public.notification_kind,
      new.member_id, new.post_id);
  end if;
  return null;
end;
$$;

create or replace function private.notify_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if old.status = 'draft' and new.status = 'published' then
    for c in select id, member_id from public.credits where post_id = new.id and status = 'pending' and member_id is not null loop
      perform private.request_or_auto_approve(c.id, c.member_id, new.author_id, new.id);
    end loop;
  end if;

  if old.held_at is null and new.held_at is not null then
    perform private.notify(new.author_id, 'post_held', null, new.id);
  elsif old.held_at is not null and new.held_at is null and new.status = 'published' then
    perform private.notify(new.author_id, 'post_released', null, new.id);
  end if;

  if old.status = 'published' and new.status = 'hidden' then
    perform private.notify(new.author_id, 'post_hidden', null, new.id);
  elsif old.status = 'hidden' and new.status = 'published' and old.removed_at is not null then
    perform private.notify(new.author_id, 'post_restored'::public.notification_kind, null, new.id);
  end if;
  return null;
end;
$$;

-- 연말 결산 알림: 12월 8일부터 연말까지 회원마다 한 해에 한 번. 보낸 수를 돌려준다.
create function private.send_year_review_alerts(today date default (now() at time zone 'Asia/Seoul')::date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent integer;
  year_start timestamptz := make_timestamptz(extract(year from today)::int, 1, 1, 0, 0, 0, 'Asia/Seoul');
begin
  if extract(month from today) <> 12 or extract(day from today) < 8 then
    return 0;
  end if;
  with active as (
    select p.author_id as user_id from public.posts p
    where p.status = 'published' and p.shot_year = extract(year from today)::int
    union
    select c.member_id from public.credits c join public.posts p on p.id = c.post_id
    where c.status = 'approved' and c.member_id is not null and p.status = 'published' and p.shot_year = extract(year from today)::int
  )
  insert into public.notifications (recipient_id, kind)
  select a.user_id, 'year_review'::text::public.notification_kind
  from active a
  join public.profiles pr on pr.id = a.user_id and pr.memory_alerts and pr.deletion_requested_at is null
  where not exists (
    select 1 from public.notifications n
    where n.recipient_id = a.user_id and n.kind::text = 'year_review' and n.created_at >= year_start
  );
  get diagnostics sent = row_count;
  return sent;
end;
$$;
revoke all on function private.send_year_review_alerts(date) from public, anon, authenticated;
