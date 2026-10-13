-- 계정 삭제 (S-14 ⑤ · P-01): 요청 → 30일 유예 → 영구 삭제
--  · 유예 중에는 프로필 · 게시물이 다른 사람에게 보이지 않는다 (본인 · 운영자는 본다)
--  · 유예 중 다시 로그인해 취소할 수 있다
--  · 영구 삭제는 매일 DB 백업 직후 GitHub Actions가 private.purge_deleted_accounts()를 부른다
--  · 남의 게시물 속 내 크레딧은 '탈퇴한 회원'(외부 표기)으로 바꾼다

alter table public.profiles add column deletion_requested_at timestamptz;

-- 작성자가 탈퇴 유예 중이 아닌지
create function private.author_active(author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where id = author and deletion_requested_at is not null
  );
$$;
revoke all on function private.author_active(uuid) from public, anon, authenticated;
grant execute on function private.author_active(uuid) to anon, authenticated;

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
      and ((p.status = 'published' and p.held_at is null and private.author_active(p.author_id))
           or p.author_id = (select auth.uid())
           or private.is_admin())
  );
$$;

drop policy "게시된 글 · 내 글 · 운영자" on public.posts;
create policy "게시된 글 · 내 글 · 운영자" on public.posts
  for select to anon, authenticated
  using (
    (status = 'published' and held_at is null and private.author_active(author_id))
    or author_id = (select auth.uid())
    or (select private.is_admin())
  );

drop policy "프로필은 누구나 본다" on public.profiles;
create policy "탈퇴 유예가 아닌 프로필은 누구나 본다" on public.profiles
  for select to anon, authenticated
  using (deletion_requested_at is null or id = (select auth.uid()) or (select private.is_admin()));

create function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  requested timestamptz;
begin
  if me is null then
    raise exception 'login_required' using errcode = '42501';
  end if;
  update public.profiles set deletion_requested_at = coalesce(deletion_requested_at, now())
  where id = me
  returning deletion_requested_at into requested;
  if requested is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values (me, 'account_deletion_requested', 'profiles', me, '{}');
  return requested;
end;
$$;

create function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'login_required' using errcode = '42501';
  end if;
  update public.profiles set deletion_requested_at = null where id = me and deletion_requested_at is not null;
  if found then
    insert into private.audit_log (actor_id, action, target_table, target_id, detail)
    values (me, 'account_deletion_cancelled', 'profiles', me, '{}');
  end if;
end;
$$;

revoke all on function public.request_account_deletion(), public.cancel_account_deletion() from public, anon, authenticated;
grant execute on function public.request_account_deletion(), public.cancel_account_deletion() to authenticated;

-- 영구 삭제 (API 역할은 부를 수 없다. DB 관리자 연결 전용)
-- 운영자 계정 · 촬영 동의 기록이 남은 계정은 자동 삭제하지 않고 건너뛴다 (기록 보존 의무).
create function private.purge_deleted_accounts(grace interval default interval '30 days')
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
    if target.role = 'admin'
       or exists (select 1 from public.consent_records where created_by = target.id) then
      user_id := target.id;
      outcome := 'skipped_manual_review';
      return next;
      continue;
    end if;

    -- 한 계정이 실패해도(예: 남이 남긴 동의 기록이 게시물에 묶여 있음) 나머지는 계속 처리한다
    begin
      -- 남의 게시물 속 크레딧은 '탈퇴한 회원'으로 남긴다
      update public.credits
        set member_id = null, status = 'external', external_label = '탈퇴한 회원', external_url = null
      where member_id = target.id
        and post_id not in (select id from public.posts where author_id = target.id);

      -- auth.users 삭제 → profiles · 게시물 · 사진 · 태그 연결 · 신고 등이 연쇄 삭제된다
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
