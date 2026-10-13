import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { PhotoFeed } from "@/components/photo-feed";
import { YearChips } from "@/components/year-chips";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/photos/post-input";
import { loadFeed } from "@/lib/posts/feed";
import { feedHref, MAX_QUERY_LENGTH, parseCategory, parseQuery } from "@/lib/posts/feed-params";
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
  const [years, items] = await Promise.all([
    supabase.rpc("published_shot_years"),
    loadFeed({ year, category, query }),
  ]);
  if (years.error) throw years.error;

  const filtered = query !== null || category !== null || year !== null;
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
