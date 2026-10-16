-- 본인 설정 읽기 (출시 전 점검)
--  · profiles의 개인 설정 열(관심 분야 · 가림 바로 보기 · 추억 알림 · 크레딧 자동 승인 · 업로드 회수 시각)은
--    지금 누구나 읽을 수 있다. 다음 단계에서 이 열들의 공개 읽기 권한을 걷어낸다.
--  · 그 전에 앱이 본인 설정을 이 함수로 읽도록 먼저 바꾼다 (배포 순서: 함수 → 앱 → 권한 회수).

create function public.my_settings()
returns table (
  interest_categories public.post_category[],
  show_veiled boolean,
  memory_alerts boolean,
  credit_auto_approve boolean,
  upload_revoked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.interest_categories, p.show_veiled, p.memory_alerts, p.credit_auto_approve, p.upload_revoked_at
  from public.profiles p
  where p.id = (select auth.uid());
$$;
revoke all on function public.my_settings() from public, anon, authenticated;
grant execute on function public.my_settings() to authenticated;
