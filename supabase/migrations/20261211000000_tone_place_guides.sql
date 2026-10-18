-- 색감 · 촬영지 가이드 (디자인 v2 아이디어 중 DB가 필요한 마지막 묶음)
--  1) 색감으로 찾기: 사진 대표 색(photos.color)에서 색감을 정해 둔다 — 따뜻한 · 차가운 · 흑백 · 파스텔 · 어두운
--  2) 촬영지 가이드: 공식 장소 태그에 추천 시간대 · 입장료 · 삼각대 · 주차 · 한 줄 팁 (운영자가 적는다)

-- ─────────────────────────────────────────────
-- 1) 색감
-- ─────────────────────────────────────────────
-- #rrggbb → 색감. 밝기 · 채도 · 색상(HSL)으로 나눈다. 색이 없으면 null.
create function private.color_tone(hex text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  r numeric;
  g numeric;
  b numeric;
  mx numeric;
  mn numeric;
  l numeric;
  s numeric;
  h numeric;
begin
  if hex is null or hex !~ '^#[0-9a-f]{6}$' then
    return null;
  end if;
  r := ('x' || substr(hex, 2, 2))::bit(8)::int / 255.0;
  g := ('x' || substr(hex, 4, 2))::bit(8)::int / 255.0;
  b := ('x' || substr(hex, 6, 2))::bit(8)::int / 255.0;
  mx := greatest(r, g, b);
  mn := least(r, g, b);
  l := (mx + mn) / 2;
  if l < 0.18 then
    return 'dark';
  end if;
  s := case when mx = mn then 0 else (mx - mn) / (1 - abs(2 * l - 1)) end;
  if s < 0.12 then
    return 'mono';
  end if;
  if l > 0.72 then
    return 'pastel';
  end if;
  h := case
    when mx = r then 60 * (((g - b) / (mx - mn)) + 6)
    when mx = g then 60 * (((b - r) / (mx - mn)) + 2)
    else 60 * (((r - g) / (mx - mn)) + 4)
  end;
  h := h - 360 * floor(h / 360);
  return case when h < 70 or h >= 300 then 'warm' else 'cool' end;
end;
$$;
revoke all on function private.color_tone(text) from public, anon, authenticated;
grant execute on function private.color_tone(text) to anon, authenticated;

alter table public.photos add column tone text generated always as (private.color_tone(color)) stored;
create index photos_tone_idx on public.photos (tone, post_id) where tone is not null;

-- 그 색감인 글 (첫 사진 기준, 최신 게시순). 보는 사람 권한으로 (RLS가 볼 수 있는 글만)
create function public.tone_posts(pick text, max_rows integer default 60)
returns table (post_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id
  from public.posts p
  cross join lateral (
    select ph.tone from public.photos ph where ph.post_id = p.id order by ph.position limit 1
  ) cover
  where p.status = 'published' and cover.tone = pick
  order by p.published_at desc nulls last
  limit least(greatest(coalesce(max_rows, 60), 1), 200);
$$;
revoke all on function public.tone_posts(text, integer) from public, anon, authenticated;
grant execute on function public.tone_posts(text, integer) to anon, authenticated;

-- ─────────────────────────────────────────────
-- 2) 촬영지 가이드
-- ─────────────────────────────────────────────
create table public.place_guides (
  tag_id uuid primary key references public.tags (id) on delete cascade,
  best_time text not null default '' check (char_length(best_time) <= 80 and best_time !~ '[[:cntrl:]]'),
  fee text not null default '' check (char_length(fee) <= 80 and fee !~ '[[:cntrl:]]'),
  tripod text not null default '' check (char_length(tripod) <= 80 and tripod !~ '[[:cntrl:]]'),
  parking text not null default '' check (char_length(parking) <= 80 and parking !~ '[[:cntrl:]]'),
  tip text not null default '' check (char_length(tip) <= 200 and tip !~ '[[:cntrl:]]'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.place_guides enable row level security;

-- 공식 장소 태그의 가이드만 누구나 본다. 쓰기는 아래 함수로만.
create policy place_guides_read on public.place_guides for select to anon, authenticated
  using (exists (select 1 from public.tags t where t.id = tag_id and t.kind = 'place' and t.status = 'official'));
grant select (tag_id, best_time, fee, tripod, parking, tip, updated_at) on public.place_guides to anon, authenticated;

-- 운영자(관리자 · 모더레이터)가 적는다. 모두 비우면 지운다. 감사 로그.
create function public.set_place_guide(
  target uuid,
  best_time text default '',
  fee text default '',
  tripod text default '',
  parking text default '',
  tip text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_best text := btrim(coalesce(best_time, ''));
  v_fee text := btrim(coalesce(fee, ''));
  v_tripod text := btrim(coalesce(tripod, ''));
  v_parking text := btrim(coalesce(parking, ''));
  v_tip text := btrim(coalesce(tip, ''));
begin
  if not private.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tags where id = target and kind = 'place' and status = 'official') then
    raise exception 'not_official_place' using errcode = 'P0001';
  end if;
  if v_best = '' and v_fee = '' and v_tripod = '' and v_parking = '' and v_tip = '' then
    delete from public.place_guides where tag_id = target;
  else
    insert into public.place_guides as g (tag_id, best_time, fee, tripod, parking, tip, updated_by, updated_at)
    values (target, v_best, v_fee, v_tripod, v_parking, v_tip, (select auth.uid()), now())
    on conflict (tag_id) do update
      set best_time = excluded.best_time, fee = excluded.fee, tripod = excluded.tripod, parking = excluded.parking,
          tip = excluded.tip, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'place_guide', 'tags', target,
          jsonb_build_object('best_time', v_best, 'fee', v_fee, 'tripod', v_tripod, 'parking', v_parking, 'tip', v_tip));
end;
$$;
revoke all on function public.set_place_guide(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.set_place_guide(uuid, text, text, text, text, text) to authenticated;
