-- 게시된 글에 사진 추가
--  · photos.ready_at: 변환본 파일이 모두 올라간 시각. 비어 있으면 작성자 · 운영자만 본다 (깨진 사진 방지)
--  · add_my_photos(): 사진 행 + 워터마크 열쇠를 한 번에 (게시물당 20장까지, 운영자가 게시 중단한 글은 불가)
--    사람이 나오는 글은 촬영 동의 기록과 묶여 있어 지금은 운영자만 (업로드 규칙과 같음)
--  · 서버가 파일을 확인한 뒤 finish_my_photos()로 공개한다
--  · 초안은 지금처럼 게시할 때 한꺼번에 공개된다
--  · 하루가 지나도 파일이 다 올라가지 않은 사진은 매일 정리한다

alter table public.photos add column ready_at timestamptz;
update public.photos set ready_at = created_at;

drop policy "보이는 게시물의 사진만" on public.photos;
create policy "보이는 게시물의 다 올라간 사진만" on public.photos
  for select to anon, authenticated
  using (
    private.post_is_visible(post_id)
    and (ready_at is not null or private.is_post_author(post_id) or (select private.is_admin()))
  );

-- 초안을 게시하면 사진도 함께 공개
create function private.ready_photos_on_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'published' then
    update public.photos set ready_at = now() where post_id = new.id and ready_at is null;
  end if;
  return null;
end;
$$;
create trigger posts_ready_photos
after update of status on public.posts
for each row execute function private.ready_photos_on_publish();

create function public.add_my_photos(target uuid, entries jsonb)
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
    where id = target and author_id = me and status in ('published', 'hidden') and removed_at is null
  ) then
    raise exception 'post_not_editable' using errcode = '42501';
  end if;
  if not (select can_upload from public.profiles where id = me) then
    raise exception 'upload_not_allowed' using errcode = '42501';
  end if;
  if (select has_people from public.posts where id = target) and not private.is_admin() then
    raise exception 'people_admin_only' using errcode = '42501';
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

-- 파일이 다 올라간 사진을 공개 (서버가 저장소를 확인한 뒤 부른다)
create function public.finish_my_photos(target uuid, ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  done integer;
begin
  if not exists (select 1 from public.posts where id = target and author_id = (select auth.uid())) then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  update public.photos set ready_at = now() where post_id = target and id = any (ids) and ready_at is null;
  get diagnostics done = row_count;
  return done;
end;
$$;

-- 오래된 초안 + 하루 넘게 다 올라가지 않은 추가 사진 정리
create or replace function private.purge_stale_drafts(age interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
  stale_photos integer;
begin
  delete from public.posts p
  where p.status = 'draft'
    and p.created_at < now() - age
    and not exists (select 1 from public.consent_records c where c.post_id = p.id);
  get diagnostics removed = row_count;

  delete from public.photos ph
  using public.posts p
  where p.id = ph.post_id and p.status <> 'draft' and ph.ready_at is null and ph.created_at < now() - interval '1 day';
  get diagnostics stale_photos = row_count;

  if removed > 0 or stale_photos > 0 then
    insert into private.audit_log (actor_id, action, target_table, target_id, detail)
    values (null, 'stale_drafts_purged', 'posts', null, jsonb_build_object('count', removed, 'photos', stale_photos));
  end if;
  return removed;
end;
$$;

revoke all on function private.ready_photos_on_publish() from public, anon, authenticated;
revoke all on function public.add_my_photos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.add_my_photos(uuid, jsonb) to authenticated;
revoke all on function public.finish_my_photos(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.finish_my_photos(uuid, uuid[]) to authenticated;
