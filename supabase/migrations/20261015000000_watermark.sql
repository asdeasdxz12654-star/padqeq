-- 보이지 않는 워터마크 열쇠 (사진마다 16바이트).
-- 열쇠를 알면 무늬를 지울 수 있으므로 공개 API에 노출되지 않는 private 스키마에 둔다.
--  · 넣기: 업로드한 본인이 초안일 때만 (브라우저가 변환하며 만든 열쇠)
--  · 꺼내기: 운영자만 (유출 사진 판정용)

create table private.photo_watermarks (
  photo_id uuid primary key references public.photos (id) on delete cascade,
  seed bytea not null check (octet_length(seed) = 16),
  created_at timestamptz not null default now()
);
alter table private.photo_watermarks enable row level security;
revoke all on private.photo_watermarks from public, anon, authenticated;

create function public.set_photo_watermarks(target_post uuid, entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
begin
  if not exists (
    select 1 from public.posts
    where id = target_post and author_id = (select auth.uid()) and status = 'draft'
  ) then
    raise exception 'post_not_editable' using errcode = '42501';
  end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 20 then
    raise exception 'entries_invalid' using errcode = 'P0001';
  end if;

  for entry in select * from jsonb_array_elements(entries) loop
    if (entry ->> 'seed') !~ '^[0-9a-f]{32}$' then
      raise exception 'seed_invalid' using errcode = 'P0001';
    end if;
    -- 이 게시물의 사진에만 넣는다
    if not exists (
      select 1 from public.photos where id = (entry ->> 'photo_id')::uuid and post_id = target_post
    ) then
      raise exception 'photo_not_in_post' using errcode = 'P0001';
    end if;
    insert into private.photo_watermarks (photo_id, seed)
    values ((entry ->> 'photo_id')::uuid, decode(entry ->> 'seed', 'hex'))
    on conflict (photo_id) do update set seed = excluded.seed, created_at = now();
  end loop;
end;
$$;

create function public.photo_watermark_seeds(target_post uuid)
returns table (photo_id uuid, "position" smallint, seed text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.position, encode(w.seed, 'hex')
  from public.photos p
  join private.photo_watermarks w on w.photo_id = p.id
  where p.post_id = target_post and private.is_admin()
  order by p.position;
$$;

revoke all on function public.set_photo_watermarks(uuid, jsonb), public.photo_watermark_seeds(uuid)
  from public, anon, authenticated;
grant execute on function public.set_photo_watermarks(uuid, jsonb), public.photo_watermark_seeds(uuid)
  to authenticated;
