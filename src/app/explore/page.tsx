import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { PhotoFeed } from "@/components/photo-feed";
import { TagChip } from "@/components/tag-chip";
import { YearChips } from "@/components/year-chips";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/photos/post-input";
import { loadFeed } from "@/lib/posts/feed";
import { escapeLike, feedHref, MAX_QUERY_LENGTH, parseCategory, parseQuery } from "@/lib/posts/feed-params";
import { createClient } from "@/lib/supabase/server";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";

export const metadata: Metadata = { title: "탐색" };

// S-04 탐색 (1단계: 검색 · 카테고리 · 촬영 연도).
// 작품 랭킹 · 행사 · 촬영 장소는 태그 · 행사 기능과 함께 붙인다.
export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const params = await searchParams;
  const year = parseYearParam(params.year);
  const category = parseCategory(params.category);
  const query = parseQuery(params.q);
  const q = query ? (query.kind === "handle" ? `@${query.text}` : query.text) : null;
  const current = { year, category, q };

  const supabase = await createClient();
  const filtered = query !== null || category !== null || year !== null;
  const [years, items, trending, matchedTags] = await Promise.all([
    supabase.rpc("published_shot_years"),
    loadFeed({ year, category, query }),
    // 조건이 없을 때만: 최근 7일 많이 찍은 작품 (S-04 ③)
    filtered ? Promise.resolve(null) : supabase.rpc("trending_works", { days: 7, max_rows: 10 }),
    query?.kind === "title" ? findTags(query.text) : Promise.resolve([]),
  ]);
  if (years.error) throw years.error;
  const chip = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap";

  return (
    <div className="mx-auto max-w-[1440px]">
      <h1 className="sr-only">탐색</h1>

      <div className="px-4 pt-4 md:px-6">
        <Form action="/explore" role="search" className="flex gap-2">
          {category && <input type="hidden" name="category" value={category} />}
          {year !== null && <input type="hidden" name="year" value={year} />}
          <label className="sr-only" htmlFor="explore-q">
            검색어
          </label>
          <input
            id="explore-q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="제목 또는 @핸들"
            enterKeyHint="search"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent"
          />
          <button type="submit" className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent">
            찾기
          </button>
        </Form>
      </div>

      <nav aria-label="카테고리">
        <ul className="flex gap-2 overflow-x-auto px-4 pt-3 md:px-6 [scrollbar-width:none]">
          {CATEGORIES.filter((c) => c !== "other").map((c) => {
            const active = category === c;
            return (
              <li key={c}>
                <Link
                  href={feedHref("/explore", current, { category: active ? null : c })}
                  aria-current={active ? "page" : undefined}
                  className={`${chip} ${active ? "border-text bg-text font-semibold text-bg" : "border-line hover:border-quiet"}`}
                >
                  {CATEGORY_LABEL[c]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <YearChips
        chips={buildYearChips(years.data.map((row) => row.year))}
        selected={year}
        hrefFor={(y) => feedHref("/explore", current, { year: y })}
      />

      {matchedTags.length > 0 && (
        <section aria-label="태그" className="px-4 pt-1 md:px-6">
          <ul className="flex flex-wrap gap-1.5">
            {matchedTags.map((tag) => (
              <li key={tag.id}>
                <TagChip tag={tag} showKind />
              </li>
            ))}
          </ul>
        </section>
      )}

      {trending?.data && trending.data.length > 0 && (
        <section aria-labelledby="trending-heading" className="px-4 pb-2 md:px-6">
          <h2 id="trending-heading" className="text-sm font-semibold">
            지금 많이 찍는 작품
          </h2>
          <ol className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {trending.data.map((work, i) => (
              <li key={work.id} className="shrink-0">
                <Link
                  href={`/t/${encodeURIComponent(work.slug)}`}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm hover:border-quiet"
                >
                  <span className="font-semibold tabular-nums text-quiet">{i + 1}</span>
                  {work.name}
                  <span className="text-xs text-quiet">
                    {work.total_count} · 이번 주 +{work.recent_count}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {filtered && (
        <p className="flex items-center gap-3 px-4 pb-2 text-sm text-quiet md:px-6">
          {items.length === 0 ? "찾는 사진이 없어요." : `${items.length}개${items.length >= 40 ? " 이상" : ""}`}
          <Link href="/explore" className="underline underline-offset-4">
            조건 지우기
          </Link>
        </p>
      )}

      <PhotoFeed items={items} empty={filtered ? "다른 검색어나 조건으로 찾아보세요." : "아직 담긴 사진이 없어요."} />
    </div>
  );
}

/** 검색어가 이름이나 다른 표기(별칭)에 들어간 태그 (볼 수 있는 것만, RLS) */
async function findTags(text: string) {
  const supabase = await createClient();
  const pattern = `%${escapeLike(text)}%`;
  const [byName, byAlias] = await Promise.all([
    supabase.from("tags").select("id").ilike("name", pattern).limit(8),
    supabase.from("tag_aliases").select("tag_id").ilike("alias", pattern).limit(8),
  ]);
  const ids = [...new Set([...(byName.data ?? []).map((r) => r.id), ...(byAlias.data ?? []).map((r) => r.tag_id)])];
  if (!ids.length) return [];
  const { data } = await supabase.from("tags").select("id, slug, name, kind").in("id", ids.slice(0, 8)).order("name");
  return data ?? [];
}
