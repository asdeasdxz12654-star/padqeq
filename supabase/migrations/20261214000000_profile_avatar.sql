-- 프로필 사진 (S-09). 올리지 않으면 빈 자리로 둔다 (임의의 그림을 만들어 넣지 않는다).
--  · 저장소 열쇠만 적는다. 파일은 R2(PHOTOS 버킷)의 avatars/<내 id>/<무작위>.avif
--  · 열쇠를 직접 고치게 두면 남의 파일을 가리킬 수 있으므로 함수로만 바꾼다

alter table public.profiles
  add column avatar_key text check (avatar_key ~ '^avatars/[0-9a-f-]{36}/[0-9a-f]{32}\.avif$');

-- 프로필 열은 열 단위로 허용한다 (20261205 profile_private_columns). 사진은 누구나 본다.
grant select (avatar_key) on public.profiles to anon, authenticated;

-- 내 프로필 사진 바꾸기 · 내리기 (key가 null이면 내린다).
-- 내 폴더(avatars/<내 id>/)의 열쇠만 받는다.
create function public.set_my_avatar(key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if key is not null and key !~ ('^avatars/' || me::text || '/[0-9a-f]{32}\.avif$') then
    raise exception 'avatar_key_not_mine' using errcode = '42501';
  end if;
  update public.profiles set avatar_key = key where id = me;
end;
$$;

revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;
