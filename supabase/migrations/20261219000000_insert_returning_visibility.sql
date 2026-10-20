-- 새 태그 · 새 컬렉션을 만들 수 없던 문제
--  · 앱은 만든 뒤 id를 돌려받는다 (insert … returning). 이때 Postgres는 새 행에 읽기(select) 정책도 적용한다.
--  · 두 표의 읽기 정책이 "id로 표를 다시 찾아보는 함수"(tag_is_usable · collection_is_visible)였는데,
--    stable 함수는 문장 시작 시점의 데이터만 봐서 방금 넣은 행을 찾지 못한다 → 'new row violates row-level security policy'
--  · 읽기 정책을 행의 열로 바로 판단하게 바꾼다 (판단 기준은 그대로). 두 함수는 다른 표(별칭 · 담긴 글)의 정책에서 계속 쓴다.

drop policy "공식 · 내 제안 · 운영자" on public.tags;
create policy "공식 · 내 제안 · 운영자" on public.tags
  for select to anon, authenticated
  using (status = 'official' or created_by = (select auth.uid()) or (select private.is_admin()));

drop policy "공개 컬렉션 · 내 컬렉션" on public.collections;
create policy "공개 컬렉션 · 내 컬렉션" on public.collections
  for select to anon, authenticated
  using (owner_id = (select auth.uid()) or (is_public and private.author_active(owner_id)) or (select private.is_admin()));
