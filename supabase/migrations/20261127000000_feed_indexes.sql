-- 피드 이어 보기 (QA 점검)
--  · 홈 · 탐색 · 태그 피드는 게시 시각 순으로 40개씩 이어 받는다. 기존 posts_feed_idx는 촬영 연도가 앞이라
--    연도 없이 최신순으로 볼 때는 쓰이지 않는다 → 게시 시각만으로 된 인덱스
--  · 프로필(회원별 작업물)도 게시 시각 순으로 이어 받는다 → 회원 + 게시 시각
create index if not exists posts_published_recent_idx on public.posts (published_at desc)
  where status = 'published' and held_at is null;
create index if not exists posts_author_published_idx on public.posts (author_id, published_at desc)
  where status = 'published';
