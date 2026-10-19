-- 회원의 인물 사진 · 내 글 지우기 (2026-10-19 점검 결정)
--  · 인물 · 코스프레 사진: 운영자만 → 촬영 동의 기록을 적으면 회원도 게시. 동의 기록은 계속 운영자만 본다.
--  · 내 글 지우기: 작성자가 지우면 휴지통으로(작성자가 지운 글 표시). 30일 동안 작성자가 '지운 글'에서 보고 되살릴 수 있고,
--    지나면 매일 정리 작업이 영구 삭제한다(운영자 휴지통과 같은 정리). 함께 이름이 오른 회원에게 알린다.
--  · 동의 기록 보존: 게시물이 영구 삭제되거나 기록을 남긴 회원이 탈퇴해도 기록은 분쟁 대응을 위해 3년 남기고 지운다.
--    (예전에는 게시물 삭제를 막아 사람이 나온 글은 휴지통 정리가 실패했고, 기록을 남긴 계정은 탈퇴 정리에서 건너뛰었다)

alter type public.notification_kind add value if not exists 'credited_post_deleted';

-- ─────────────────────────────────────────────
-- 촬영 동의 기록
-- ─────────────────────────────────────────────
alter table public.consent_records
  add column source_post_id uuid,
  add column post_deleted_at timestamptz;
update public.consent_records set source_post_id = post_id;
alter table public.consent_records alter column source_post_id set not null;

alter table public.consent_records alter column post_id drop not null;
alter table public.consent_records drop constraint consent_records_post_id_fkey;
alter table public.consent_records
  add constraint consent_records_post_id_fkey foreign key (post_id) references public.posts (id) on delete set null;

alter table public.consent_records alter column created_by drop not null;
alter table public.consent_records drop constraint consent_records_created_by_fkey;
alter table public.consent_records
  add constraint consent_records_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;

-- 어느 글의 기록이었는지는 게시물이 지워진 뒤에도 남긴다
create function private.consent_source_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.source_post_id := new.post_id;
  return new;
end;
$$;
revoke all on function private.consent_source_post() from public, anon, authenticated;
create trigger consent_records_source_post before insert on public.consent_records
  for each row execute function private.consent_source_post();

create function private.mark_consent_post_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.consent_records set post_deleted_at = now() where post_id = old.id;
  return old;
end;
$$;
revoke all on function private.mark_consent_post_deleted() from public, anon, authenticated;
create trigger posts_mark_consent_deleted before delete on public.posts
  for each row execute function private.mark_consent_post_deleted();

-- 회원도 내 글의 동의 기록을 남긴다 (보기는 계속 운영자만)
drop policy "운영자만 남긴다" on public.consent_records;
create policy "작성자 · 운영자가 남긴다" on public.consent_records
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and ((select private.is_admin()) or (post_id is not null and private.is_post_author(post_id)))
  );

-- 3년 지난 기록 지우기 (매일 정리 작업, DB 관리자 연결 전용)
create function private.purge_old_consent_records(age interval default interval '3 years')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with gone as (delete from public.consent_records where post_deleted_at <= now() - age returning 1)
  select count(*)::integer into n from gone;
  return n;
end;
$$;
revoke all on function private.purge_old_consent_records(interval) from public, anon, authenticated;

-- 사진 더하기: 사람이 나오는 글도 작성자가 (게시할 때 동의 기록을 남겼으므로)
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
    where id = target and author_id = me and status in ('published', 'hidden') and removed_at is null and trashed_at is null
  ) then
    raise exception 'post_not_editable' using errcode = '42501';
  end if;
  if not private.can_upload() then
    raise exception 'upload_not_allowed' using errcode = '42501';
  end if;
  if (select has_people from public.posts where id = target)
     and not exists (select 1 from public.consent_records where post_id = target) then
    raise exception 'consent_required' using errcode = '42501';
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

-- 탈퇴 정리: 동의 기록이 있어도 건너뛰지 않는다 (기록은 남기고 남긴 사람만 비운다). 운영자 계정만 수동 검토.
create or replace function private.purge_deleted_accounts(grace interval default interval '30 days')
returns table (user_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
begin
  for target in
    select id, role from public.profiles
    where deletion_requested_at is not null and deletion_requested_at < now() - grace
  loop
    if target.role = 'admin' then
      user_id := target.id;
      outcome := 'skipped_manual_review';
      return next;
      continue;
    end if;

    begin
      -- 남의 게시물 속 크레딧은 '탈퇴한 회원'으로 남긴다
      update public.credits
        set member_id = null, status = 'external', external_label = '탈퇴한 회원', external_url = null
      where member_id = target.id
        and post_id not in (select id from public.posts where author_id = target.id);

      -- auth.users 삭제 → profiles · 게시물 · 사진 · 태그 연결 · 신고 등이 연쇄 삭제된다 (동의 기록은 3년 보존)
      delete from auth.users where id = target.id;

      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (null, 'account_purged', 'profiles', target.id, '{}');
      outcome := 'purged';
    exception when others then
      insert into private.audit_log (actor_id, action, target_table, target_id, detail)
      values (null, 'account_purge_failed', 'profiles', target.id, jsonb_build_object('error', sqlerrm));
      outcome := 'failed';
    end;
    user_id := target.id;
    return next;
  end loop;
end;
$$;
revoke all on function private.purge_deleted_accounts(interval) from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- 내 글 지우기 · 되살리기
-- ─────────────────────────────────────────────
alter table public.posts add column trashed_by_author boolean not null default false;

-- 작성자가 지운 글은 작성자에게만 보인다 ('지운 글'). 운영자가 휴지통에 넣은 글은 그대로 운영자만.
create or replace function private.post_is_visible(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = target
      and ((p.trashed_at is null
            and ((p.status = 'published' and p.held_at is null and private.author_active(p.author_id)
                  and not private.blocked_with_me(p.author_id) and private.audience_ok(p.author_id, p.visibility, p.scheduled_at))
                 or p.author_id = (select auth.uid())
                 or private.is_staff()))
           or (p.trashed_by_author and p.author_id = (select auth.uid()))
           or private.is_admin())
  );
$$;

drop policy "게시된 글 · 내 글 · 운영자" on public.posts;
create policy "게시된 글 · 내 글 · 운영자" on public.posts
  for select to anon, authenticated
  using (
    (trashed_at is null
     and ((status = 'published' and held_at is null and private.author_active(author_id)
           and not private.blocked_with_me(author_id) and private.audience_ok(author_id, visibility, scheduled_at))
          or author_id = (select auth.uid())
          or (select private.is_staff())))
    or (trashed_by_author and author_id = (select auth.uid()))
    or (select private.is_admin())
  );

-- 휴지통 글은 운영진(20261126과 같게)만 바꾼다. 작성자의 되살리기는 아래 함수 안에서만 (함수가 표시를 켠다)
create or replace function private.guard_trashed_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.trashed_at is not null and not private.is_staff()
     and coalesce(current_setting('haedam.author_trash', true), '') <> 'on' then
    raise exception 'post_trashed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.delete_my_post(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row_ public.posts%rowtype;
  credited uuid;
begin
  select * into row_ from public.posts where id = target for update;
  if me is null or not found or row_.author_id <> me then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  if row_.trashed_at is not null then
    raise exception 'post_trashed' using errcode = 'P0001';
  end if;
  -- 범죄 의심으로 격리한 글은 지울 수 없다 (원본 보존)
  if row_.quarantined_at is not null then
    raise exception 'post_quarantined' using errcode = '42501';
  end if;
  -- 초안은 바로 지운다 (휴지통에 둘 이유가 없다)
  if row_.status = 'draft' then
    delete from public.posts where id = target;
    return;
  end if;

  update public.posts
  set trashed_at = now(), trashed_by_author = true, trash_prev_status = row_.status, trash_prev_removed_at = row_.removed_at,
      status = case when row_.status = 'published' then 'hidden'::public.post_status else row_.status end
  where id = target;

  -- 함께 이름이 오른 회원에게 (게시된 적 있는 글만, 글 제목은 알림에 남기지 않는다)
  if row_.status = 'published' then
    for credited in
      select distinct member_id from public.credits where post_id = target and status = 'approved' and member_id is not null
    loop
      perform private.notify(credited, 'credited_post_deleted', me, null);
    end loop;
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values (me, 'post_author_delete', 'posts', target, jsonb_build_object('title', row_.title, 'from', row_.status));
end;
$$;
revoke all on function public.delete_my_post(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_post(uuid) to authenticated;

create function public.restore_my_post(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row_ public.posts%rowtype;
begin
  select * into row_ from public.posts where id = target for update;
  if me is null or not found or row_.author_id <> me or not row_.trashed_by_author or row_.trashed_at is null then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  if row_.trashed_at <= now() - interval '30 days' then
    raise exception 'restore_expired' using errcode = 'P0001';
  end if;

  perform set_config('haedam.author_trash', 'on', true);
  update public.posts
  set status = coalesce(row_.trash_prev_status, row_.status), removed_at = row_.trash_prev_removed_at,
      trashed_at = null, trashed_by_author = false, trash_prev_status = null, trash_prev_removed_at = null
  where id = target;
  perform set_config('haedam.author_trash', '', true);

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values (me, 'post_author_restore', 'posts', target, jsonb_build_object('title', row_.title));
end;
$$;
revoke all on function public.restore_my_post(uuid) from public, anon, authenticated;
grant execute on function public.restore_my_post(uuid) to authenticated;
