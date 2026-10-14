-- 회원 제재 (A-05): 업로드 권한 주기 · 회수, 이용 정지 · 해제
--  · 조치는 sanction_member() 한 곳에서, 운영자만 · 내부 메모 필수 · 감사 로그 · 회원에게 알림
--  · 운영자 계정은 제재할 수 없다 (운영자 본인 포함)
--  · 정지 상태는 profiles(누구나 보는 표)가 아니라 member_restrictions에 둔다. 본인과 운영자만 본다.
--  · 정지 중에는 남에게 보이는 것을 만들거나 고칠 수 없다: 게시물 · 사진 · 크레딧 · 태그 · 신고 · 크레딧 연결 요청 ·
--    컬렉션 · 프로필. 지우기 · 소명 · 저장 · 팔로우 · 크레딧 거절 · 탈퇴는 할 수 있다.
--  · 막는 일은 트리거로 한다: security definer 함수(publish_my_post 등)를 거쳐도 똑같이 막힌다
--  · 기간이 지나면 저절로 풀린다 (지난 행은 매일 정리 작업이 지운다)

alter type public.notification_kind add value if not exists 'member_suspended';
alter type public.notification_kind add value if not exists 'suspension_lifted';
alter type public.notification_kind add value if not exists 'upload_granted';
alter type public.notification_kind add value if not exists 'upload_revoked';

create table public.member_restrictions (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  suspended_until timestamptz not null,
  -- 회원에게 보여 주는 사유. 내부 메모는 감사 로그에만 남긴다.
  reason text not null check (char_length(reason) between 1 and 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.member_restrictions enable row level security;
revoke all on public.member_restrictions from public, anon, authenticated;
grant select on public.member_restrictions to authenticated;
create policy "내 이용 제한과 운영자" on public.member_restrictions
  for select to authenticated
  using (member_id = (select auth.uid()) or (select private.is_admin()));

create function private.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_restrictions
    where member_id = (select auth.uid()) and suspended_until > now()
  );
$$;
revoke all on function private.is_suspended() from public, anon, authenticated;
grant execute on function private.is_suspended() to authenticated;

-- 업로드 권한: 권한이 있고 정지 중이 아닐 때
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
  ) and not private.is_suspended();
$$;

create function private.block_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_suspended() then
    raise exception 'member_suspended' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.block_suspended() from public, anon, authenticated;

create trigger posts_block_suspended before insert or update on public.posts
  for each row execute function private.block_suspended();
create trigger photos_block_suspended before insert or update on public.photos
  for each row execute function private.block_suspended();
-- 크레딧 거절(빼기)은 정지 중에도 할 수 있다
create trigger credits_block_suspended before insert on public.credits
  for each row execute function private.block_suspended();
create trigger credits_block_suspended_update before update on public.credits
  for each row when (new.status is distinct from 'rejected') execute function private.block_suspended();
create trigger tags_block_suspended before insert on public.tags
  for each row execute function private.block_suspended();
create trigger tag_aliases_block_suspended before insert on public.tag_aliases
  for each row execute function private.block_suspended();
create trigger post_tags_block_suspended before insert on public.post_tags
  for each row execute function private.block_suspended();
create trigger reports_block_suspended before insert on public.reports
  for each row execute function private.block_suspended();
create trigger credit_claims_block_suspended before insert on public.credit_claims
  for each row execute function private.block_suspended();
create trigger collections_block_suspended before insert or update on public.collections
  for each row execute function private.block_suspended();
create trigger collection_posts_block_suspended before insert on public.collection_posts
  for each row execute function private.block_suspended();
-- 탈퇴 요청(deletion_requested_at)은 막지 않는다
create trigger profiles_block_suspended before update of display_name, bio on public.profiles
  for each row execute function private.block_suspended();

-- 운영자 조치
--  suspend: 이용 정지(days일, 다시 하면 새 기간으로 바꿈) · lift: 정지 해제 · revoke_upload / grant_upload: 업로드 권한
create function public.sanction_member(target uuid, action text, note text, days integer default null, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target_role public.member_role;
  ends timestamptz;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if action not in ('suspend', 'lift', 'revoke_upload', 'grant_upload') then
    raise exception 'action_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  select role into target_role from public.profiles where id = target for update;
  if target_role is null then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if target_role = 'admin' then
    raise exception 'target_admin' using errcode = 'P0001';
  end if;

  if action = 'suspend' then
    if days is null or days not between 1 and 3650 then
      raise exception 'days_invalid' using errcode = 'P0001';
    end if;
    if reason is null or char_length(btrim(reason)) not between 1 and 200 then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    ends := now() + make_interval(days => days);
    insert into public.member_restrictions (member_id, suspended_until, reason, created_by)
    values (target, ends, btrim(reason), me)
    on conflict (member_id) do update
      set suspended_until = excluded.suspended_until, reason = excluded.reason,
          created_by = excluded.created_by, created_at = now();
    perform private.notify(target, 'member_suspended', null, null);
  elsif action = 'lift' then
    delete from public.member_restrictions where member_id = target and suspended_until > now();
    if not found then
      raise exception 'not_suspended' using errcode = 'P0001';
    end if;
    perform private.notify(target, 'suspension_lifted', null, null);
  else
    update public.profiles set can_upload = (action = 'grant_upload')
    where id = target and can_upload is distinct from (action = 'grant_upload');
    if not found then
      raise exception 'no_change' using errcode = 'P0001';
    end if;
    perform private.notify(target,
      case action when 'grant_upload' then 'upload_granted' else 'upload_revoked' end::public.notification_kind,
      null, null);
  end if;

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values (me, 'sanction', 'profiles', target,
          jsonb_strip_nulls(jsonb_build_object('action', action, 'note', btrim(note), 'days', days,
            'until', ends, 'reason', btrim(reason))));
end;
$$;

-- 제재 기록 (운영자 화면용, 최신순)
create function public.member_sanction_history(target uuid)
returns table (action text, detail jsonb, actor_handle text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
    select a.detail ->> 'action', a.detail, p.handle::text, a.created_at
    from private.audit_log a
    left join public.profiles p on p.id = a.actor_id
    where a.target_table = 'profiles' and a.target_id = target and a.action = 'sanction'
    order by a.id desc
    limit 100;
end;
$$;

-- 기간이 지난 정지 지우기 (매일 정리 작업, DB 관리자 연결 전용)
create function private.purge_expired_restrictions()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.member_restrictions where suspended_until <= now() returning 1)
  select count(*)::integer from gone;
$$;

revoke all on function public.sanction_member(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.sanction_member(uuid, text, text, integer, text) to authenticated;
revoke all on function public.member_sanction_history(uuid) from public, anon, authenticated;
grant execute on function public.member_sanction_history(uuid) to authenticated;
revoke all on function private.purge_expired_restrictions() from public, anon, authenticated;
