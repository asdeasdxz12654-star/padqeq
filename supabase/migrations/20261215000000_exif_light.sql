-- 하루의 빛 (해담다움 10번): 촬영 시각으로 나눈 빛 — 골든아워 · 블루아워 · 낮 · 밤
--  · 업로드 때 브라우저가 EXIF 촬영 시각과 한국 기준 해 높이로 정해 촬영 정보(photos.exif)의 light 칸에 적는다
--  · 시각 자체는 저장하지 않고 네 가지 이름만. GPS는 여전히 읽지도 저장하지도 않는다
--  · 바뀐 것은 받는 칸 하나(light)와 그 값 목록뿐, 나머지 규칙은 20261121 그대로

create or replace function public.set_photo_exif(target_post uuid, entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  info jsonb;
begin
  if not exists (select 1 from public.posts where id = target_post and author_id = (select auth.uid())) then
    raise exception 'post_not_editable' using errcode = '42501';
  end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 20 then
    raise exception 'entries_invalid' using errcode = 'P0001';
  end if;
  for entry in select * from jsonb_array_elements(entries) loop
    info := entry -> 'exif';
    if info is null or jsonb_typeof(info) <> 'object' then
      continue;
    end if;
    if exists (
      select 1 from jsonb_each(info)
      where key not in ('camera', 'lens', 'aperture', 'shutter', 'iso', 'focal', 'light')
         or jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 60
         or (key = 'light' and value #>> '{}' not in ('golden', 'blue', 'day', 'night'))
    ) then
      raise exception 'exif_invalid' using errcode = 'P0001';
    end if;
    update public.photos set exif = info
    where id = (entry ->> 'photo_id')::uuid and post_id = target_post and ready_at is null;
  end loop;
end;
$$;
revoke all on function public.set_photo_exif(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_photo_exif(uuid, jsonb) to authenticated;
