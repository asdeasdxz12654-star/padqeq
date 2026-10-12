-- 업로드 1차: 사진 파일 위치(storage_key)는 DB가 무작위로 정한다.
-- 회원이 키를 지정할 수 있으면 남의 사진 파일을 자기 게시물에 끌어다 붙일 수 있으므로
-- 넣기 · 고치기 권한에서 storage_key를 뺀다. 파일은 서버(/api/photos)가 이 키로만 저장한다.

alter table public.photos
  alter column storage_key set default ('p/' || replace(gen_random_uuid()::text, '-', ''));

revoke insert, update on public.photos from authenticated;
grant insert (post_id, position, width, height, bytes, alt_text, taken_at) on public.photos to authenticated;
grant update (position, alt_text) on public.photos to authenticated;

-- 게시된 글에는 사진을 새로 붙이지 않는다 (게시 뒤 파일이 비는 일 방지)
drop policy "작성자가 사진을 넣는다" on public.photos;
create policy "작성자가 초안에 사진을 넣는다" on public.photos
  for insert to authenticated
  with check (
    private.is_post_author(post_id)
    and exists (select 1 from public.posts where id = post_id and status = 'draft')
  );

-- 게시: 촬영 동의 기록과 게시 상태 변경을 한 트랜잭션으로 처리한다
-- (동의 기록만 남고 게시는 실패하는 일 방지). 호출자 권한(RLS) 그대로 실행한다.
create function public.publish_my_post(
  target uuid,
  subject_label text default null,
  consented_on date default null,
  consent_note text default '',
  has_minor boolean default false,
  guardian_consent boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if subject_label is not null then
    insert into public.consent_records
      (post_id, subject_label, consented_on, note, has_minor, guardian_consent, created_by)
    values
      (target, subject_label, consented_on, coalesce(consent_note, ''), has_minor, guardian_consent, (select auth.uid()));
  end if;

  update public.posts set status = 'published'
  where id = target and author_id = (select auth.uid()) and status = 'draft';
  if not found then
    raise exception 'post_not_publishable' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.publish_my_post(uuid, text, date, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.publish_my_post(uuid, text, date, text, boolean, boolean) to authenticated;
