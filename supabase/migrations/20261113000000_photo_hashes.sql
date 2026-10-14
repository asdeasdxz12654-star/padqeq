-- 사진 지문 (S-14 운영 규칙 · A-02 ②)
--  · 업로드할 때 브라우저가 사진마다 64비트 지문(dHash: 크기 · 화질이 달라도 비슷하면 가까운 값)을 만든다
--  · 운영자가 게시 중단한 글의 사진 지문은 차단 목록에 올린다 → 같은(비슷한) 사진을 다시 올리면 거부 (해밍 거리 6 이하)
--  · 게시 중단을 풀면(restore) 차단 목록에서 뺀다
--  · 업로더가 이미 올린 사진과 비슷하면 업로드 화면에서 경고할 수 있게 my_similar_photos()를 둔다
--  · 새로 게시하는 글 · 새로 더하는 사진은 지문이 있어야 공개된다 (이전에 올린 사진은 그대로)
--  · 지문은 브라우저가 보내는 값이라 완벽한 차단은 아니다 (억제 · 운영 보조용)

alter table public.photos add column phash bigint;
create index photos_phash_idx on public.photos (phash) where phash is not null;

create table private.blocked_photo_hashes (
  phash bigint not null,
  source_post uuid,
  created_at timestamptz not null default now()
);
create index blocked_photo_hashes_post_idx on private.blocked_photo_hashes (source_post);
alter table private.blocked_photo_hashes enable row level security;
revoke all on private.blocked_photo_hashes from public, anon, authenticated;

create function private.hash_distance(a bigint, b bigint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select bit_count((a # b)::bit(64))::integer;
$$;

-- 지문 넣기: 아직 공개되지 않은 내 사진에만 (초안 · 막 더한 사진)
create function public.set_photo_hashes(target_post uuid, entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  value bigint;
begin
  if not exists (select 1 from public.posts where id = target_post and author_id = (select auth.uid())) then
    raise exception 'post_not_editable' using errcode = '42501';
  end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 20 then
    raise exception 'entries_invalid' using errcode = 'P0001';
  end if;
  for entry in select * from jsonb_array_elements(entries) loop
    if (entry ->> 'hash') !~ '^[0-9a-f]{16}$' then
      raise exception 'hash_invalid' using errcode = 'P0001';
    end if;
    value := ('x' || (entry ->> 'hash'))::bit(64)::bigint;
    if exists (select 1 from private.blocked_photo_hashes b where private.hash_distance(b.phash, value) <= 6) then
      raise exception 'photo_blocked' using errcode = 'P0001';
    end if;
    update public.photos set phash = value
    where id = (entry ->> 'photo_id')::uuid and post_id = target_post and ready_at is null;
    if not found then
      raise exception 'photo_not_in_post' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- 내가 이미 올린 사진 중 비슷한 것 (업로드 화면 경고용). 들어온 순서대로 '비슷한 내 글' id를 돌려준다(없으면 null).
create function public.my_similar_photos(hashes text[])
returns table (idx integer, post_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select h.idx::integer, (
    select p.post_id from public.photos p join public.posts po on po.id = p.post_id
    where po.author_id = (select auth.uid()) and p.phash is not null and po.status <> 'draft'
      and private.hash_distance(p.phash, ('x' || h.value)::bit(64)::bigint) <= 6
    limit 1
  )
  from unnest(hashes[1:100]) with ordinality as h(value, idx)
  where h.value ~ '^[0-9a-f]{16}$';
$$;

revoke all on function private.hash_distance(bigint, bigint) from public, anon, authenticated;
revoke all on function public.set_photo_hashes(uuid, jsonb), public.my_similar_photos(text[]) from public, anon, authenticated;
grant execute on function public.set_photo_hashes(uuid, jsonb), public.my_similar_photos(text[]) to authenticated;

-- 공개될 때 지문이 있어야 한다 (게시 · 더한 사진 공개)
create function private.require_photo_hash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 회원 요청에만 적용 (DB 관리자 작업 · 예약 작업은 제외)
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_table_name = 'posts' then
    if old.status = 'draft' and new.status = 'published'
       and exists (select 1 from public.photos where post_id = new.id and phash is null) then
      raise exception 'photo_hash_missing' using errcode = 'P0001';
    end if;
  elsif old.ready_at is null and new.ready_at is not null and new.phash is null
        and exists (select 1 from public.posts where id = new.post_id and status <> 'draft') then
    raise exception 'photo_hash_missing' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger posts_require_photo_hash before update of status on public.posts
  for each row execute function private.require_photo_hash();
create trigger photos_require_hash before update of ready_at on public.photos
  for each row execute function private.require_photo_hash();

-- 운영자가 게시 중단하면 그 글의 사진 지문을 차단 목록에, 풀면 뺀다
create function private.track_blocked_hashes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.removed_at is null and new.removed_at is not null then
    insert into private.blocked_photo_hashes (phash, source_post)
    select phash, new.id from public.photos where post_id = new.id and phash is not null;
  elsif old.removed_at is not null and new.removed_at is null then
    delete from private.blocked_photo_hashes where source_post = new.id;
  end if;
  return null;
end;
$$;
create trigger posts_track_blocked_hashes after update of removed_at on public.posts
  for each row execute function private.track_blocked_hashes();

revoke all on function private.require_photo_hash(), private.track_blocked_hashes() from public, anon, authenticated;
