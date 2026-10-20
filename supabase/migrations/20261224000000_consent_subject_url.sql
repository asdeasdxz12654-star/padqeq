-- 촬영 동의 기록에 사진 속 인물의 인스타그램 · X 주소 (2026-10-20)
--  · 초반에는 해담 회원이 적어, 동의해 준 분을 SNS 계정으로 남겨 두면 운영자가 초상권 문의 때 확인하기 쉽다.
--  · 선택 칸. https 주소만 (어떤 SNS인지는 앱이 고른다, 크레딧 external_url과 같은 기준).
--  · 기록은 예전처럼 운영자만 본다. 수정 · 삭제 없음.

alter table public.consent_records
  add column subject_url text check (subject_url ~ '^https://' and char_length(subject_url) <= 300);

-- 게시 함수에 subject_url을 더한다 (맨 뒤 · 기본값 null이라 예전 호출도 그대로 된다)
drop function public.publish_my_post(uuid, text, date, text, boolean, boolean);
create function public.publish_my_post(
  target uuid,
  subject_label text default null,
  consented_on date default null,
  consent_note text default '',
  has_minor boolean default false,
  guardian_consent boolean default false,
  subject_url text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if subject_label is not null then
    insert into public.consent_records
      (post_id, subject_label, consented_on, note, has_minor, guardian_consent, created_by, subject_url)
    values
      (target, subject_label, consented_on, coalesce(consent_note, ''), has_minor, guardian_consent, (select auth.uid()), subject_url);
  end if;

  update public.posts set status = 'published'
  where id = target and author_id = (select auth.uid()) and status = 'draft';
  if not found then
    raise exception 'post_not_publishable' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.publish_my_post(uuid, text, date, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.publish_my_post(uuid, text, date, text, boolean, boolean, text) to authenticated;
