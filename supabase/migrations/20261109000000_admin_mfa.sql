-- 운영자 2단계 인증 (P-02 ② · A-01 ②)
--  · 운영자 권한은 2단계 인증(TOTP)까지 마친 세션(aal2)에서만 쓴다. 비밀번호 대신 Google 로그인만 한 세션(aal1)은 일반 회원과 같다.
--  · 모든 운영 함수 · RLS가 private.is_admin()을 거치므로 이 한 곳만 바꾸면 DB 전체에 적용된다
--  · 예약 작업(DB 관리자 연결)은 운영자 권한을 쓰지 않는다

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
