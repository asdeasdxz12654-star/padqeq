-- 가림 표시 (S-08 ⑩ · S-14 ① · A-04 대체안)
--  '노출 주의'(성인 콘텐츠)는 봉인 그대로 둔다 (posts.sensitive = false 제약 유지).
--  대신 전체 이용가 사진 중 보기 불편할 수 있는 사진(피 · 상처 분장, 공포 분장, 벌레 · 혐오 소재)을
--  흐리게 가리고, 보는 사람이 눌러야 보이게 한다. 나이 확인은 하지 않는다.
--   · 업로더가 올릴 때 · 편집할 때 고른다 (posts.veil)
--   · 운영자(최고 관리자 · 운영 도우미)가 붙이거나 바꿀 수 있다. 운영자가 붙인 가림은 업로더가 풀 수 없다 (veil_by_staff)
--   · 회원은 설정에서 '가림 표시 사진 바로 보기'를 켤 수 있다 (profiles.show_veiled)

create type public.veil_reason as enum ('gore', 'fear', 'phobia');

alter table public.posts
  add column veil public.veil_reason,
  add column veil_by_staff boolean not null default false;
grant update (veil) on public.posts to authenticated;

alter table public.profiles add column show_veiled boolean not null default false;
grant update (show_veiled) on public.profiles to authenticated;

alter type public.notification_kind add value if not exists 'post_veiled';

-- 운영자가 붙인 가림은 운영자만 바꾼다. 운영자 표시(veil_by_staff)는 아무도 직접 바꾸지 못한다.
create function private.guard_post_veil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_staff() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.veil_by_staff := false;
  elsif new.veil_by_staff is distinct from old.veil_by_staff then
    raise exception 'veil_locked' using errcode = '42501';
  elsif old.veil_by_staff and new.veil is distinct from old.veil then
    raise exception 'veil_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_post_veil before insert or update of veil, veil_by_staff on public.posts
  for each row execute function private.guard_post_veil();

-- 운영자: 가림 붙이기 · 바꾸기 · 풀기. 사유를 남기고, 붙이면 업로더에게 알린다.
create function public.staff_set_post_veil(target uuid, reason text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row_ public.posts%rowtype;
  next_veil public.veil_reason;
begin
  if not private.is_staff() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if reason is not null and reason not in ('gore', 'fear', 'phobia') then
    raise exception 'reason_invalid' using errcode = 'P0001';
  end if;
  if note is null or char_length(btrim(note)) not between 1 and 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  next_veil := reason::public.veil_reason;

  select * into row_ from public.posts where id = target for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if row_.veil is not distinct from next_veil and row_.veil_by_staff = (next_veil is not null) then
    return;
  end if;

  update public.posts set veil = next_veil, veil_by_staff = (next_veil is not null) where id = target;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values (me, 'post_veil', 'posts', target,
          jsonb_build_object('note', btrim(note), 'title', row_.title, 'from', row_.veil, 'to', next_veil));
  if next_veil is not null and row_.veil is null then
    perform private.notify(row_.author_id, 'post_veiled'::text::public.notification_kind, null, target);
  end if;
end;
$$;
revoke all on function public.staff_set_post_veil(uuid, text, text) from public, anon, authenticated;
grant execute on function public.staff_set_post_veil(uuid, text, text) to authenticated;
