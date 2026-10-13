-- 게시물 편집: 사진 빼기 · 순서 바꾸기
--  · arrange_my_photos(게시물, 남길 사진 id를 보여 줄 순서대로) 한 번에 처리
--  · 1장 이상은 남아야 한다 (게시 규칙과 같음). 뺀 사진 파일은 정리 목록으로 (photos 삭제 트리거)
--  · 순서를 맞바꿀 수 있도록 (post_id, position) 고유 조건을 트랜잭션 끝에서 검사한다

alter table public.photos drop constraint photos_post_id_position_key;
alter table public.photos
  add constraint photos_post_id_position_key unique (post_id, position) deferrable initially immediate;

create function public.arrange_my_photos(target uuid, keep uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  total integer;
begin
  if me is null or not exists (select 1 from public.posts where id = target and author_id = me) then
    raise exception 'post_not_found' using errcode = '42501';
  end if;
  if keep is null or cardinality(keep) = 0 then
    raise exception 'photo_required' using errcode = 'P0001';
  end if;
  if cardinality(keep) <> (select count(distinct k) from unnest(keep) k) then
    raise exception 'photo_duplicate' using errcode = 'P0001';
  end if;
  select count(*) into total from public.photos where post_id = target and id = any (keep);
  if total <> cardinality(keep) then
    raise exception 'photo_not_in_post' using errcode = 'P0001';
  end if;

  set constraints public.photos_post_id_position_key deferred;
  delete from public.photos where post_id = target and not (id = any (keep));
  update public.photos p set position = o.ord - 1
  from unnest(keep) with ordinality as o(id, ord)
  where p.id = o.id and p.position is distinct from o.ord - 1;
end;
$$;

revoke all on function public.arrange_my_photos(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.arrange_my_photos(uuid, uuid[]) to authenticated;
