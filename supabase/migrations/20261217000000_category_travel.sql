-- 사진 분류에 '여행' (2026-10-19): 코스프레 · 모델·인물 · 풍경 · 여행 · 기타
--  · 소개 문구(코스프레 · 인물 · 풍경 · 여행)와 분류를 맞춘다. '기타' 앞에 둔다.
--  · 관심 분야는 분류를 모두 고를 수 있게 최대 5개로 (예전 4개)

alter type public.post_category add value if not exists 'travel' before 'other';

alter table public.profiles drop constraint if exists profiles_interest_categories_check;
alter table public.profiles
  add constraint profiles_interest_categories_check check (cardinality(interest_categories) <= 5);
