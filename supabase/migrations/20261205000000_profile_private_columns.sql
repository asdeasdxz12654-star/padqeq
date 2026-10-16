-- 프로필 개인 설정 열은 본인만 (출시 전 점검)
--  · 관심 분야 · 가림 바로 보기 · 추억 알림 · 크레딧 자동 승인 · 업로드 회수 시각은 남이 읽지 못하게 한다.
--    본인은 public.my_settings()로 읽고, 고치기는 지금처럼 열 단위 update 권한으로.
--  · 열 단위로 허용하므로 앞으로 추가하는 열도 따로 허용하기 전까지는 읽을 수 없다.

revoke select on public.profiles from anon, authenticated;
grant select (id, handle, display_name, bio, role, can_upload, created_at, links, pinned_post_ids, cover_post_id, deletion_requested_at)
  on public.profiles to anon, authenticated;
