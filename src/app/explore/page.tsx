import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { FeedList } from "@/components/feed-list";
import { TagChip } from "@/components/tag-chip";
import { YearChips } from "@/components/year-chips";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/photos/post-input";
import type { FeedScope } from "@/lib/posts/feed-scope";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { escapeLike, feedHref, MAX_QUERY_LENGTH, parseCategory, parseQuery, parseSort, POPULAR_DAYS } from "@/lib/posts/feed-params";
import { formatRange } from "@/lib/events/calendar";
import { listEvents } from "@/lib/events/load";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";

export const metadata: Metadata = { title: "탐색" };

// S-04 탐색: 검색(결과 탭: 게시물 · 태그 · 크리에이터 · 행사) · 카테고리 · 촬영 연도 · 최신순/인기순 · 작품 랭킹 · 행사

const RESULT_TABS = { posts: "게시물", tags: "태그", creators: "크리에이터", events: "행사" } as const;
type ResultTab = keyof typeof RESULT_TABS;
const dateOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const params = await searchParams;
  const year = parseYearParam(params.year);
  const category = parseCategory(params.category);
  const query = parseQuery(params.q);
  const q = query ? (query.kind === "handle" ? `@${query.text}` : query.text) : null;
  const sort = parseSort(params.sort);
  const current = { year, category, q, sort };
  const tab: ResultTab = query && typeof params.tab === "string" && params.tab in RESULT_TABS ? (params.tab as ResultTab) : "posts";

  const supabase = await createClient();
  const filtered = query !== null || category !== null || year !== null;
  const scope: FeedScope = { kind: "explore", year, category, q, sort };
  const [years, first, trending, matchedTags, creators, events, aroundEvents] = await Promise.all([
    supabase.rpc("published_shot_years"),
    tab !== "posts" ? Promise.resolve({ items: [], next: null }) : loadScopePage(scope),
    // 조건이 없을 때만: 최근 7일 많이 찍은 작품 (S-04 ③)
    filtered ? Promise.resolve(null) : supabase.rpc("trending_works", { days: 7, max_rows: 10 }),
    query?.kind === "title" ? findTags(query.text) : Promise.resolve([]),
    query ? findCreators(query.text) : Promise.resolve([]),
    query?.kind === "title" ? findEvents(query.text) : Promise.resolve([]),
    // 조건이 없을 때만: 다가오는 행사와 막 끝난 행사 (사진이 올라오는 시기, S-04 ④)
    filtered ? Promise.resolve([]) : listEvents(dateOffset(-14), dateOffset(30)),
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
          {sort === "popular" && <input type="hidden" name="sort" value="popular" />}
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

      {query && (
        <nav aria-label="검색 결과" className="flex gap-2 overflow-x-auto px-4 pt-3 text-sm md:px-6 [scrollbar-width:none]">
          {(Object.keys(RESULT_TABS) as ResultTab[]).map((t) => {
            const count = t === "tags" ? matchedTags.length : t === "creators" ? creators.length : t === "events" ? events.length : null;
            const search = new URLSearchParams({ q: q ?? "", ...(t !== "posts" && { tab: t }) });
            return (
              <Link
                key={t}
                href={`/explore?${search}`}
                aria-current={tab === t ? "page" : undefined}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
              >
                {RESULT_TABS[t]}
                {count ? ` ${count}` : ""}
              </Link>
            );
          })}
        </nav>
      )}

      {tab === "posts" && (
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

      )}

      {tab === "posts" && (
      <YearChips
        chips={buildYearChips(years.data.map((row) => row.year))}
        selected={year}
        hrefFor={(y) => feedHref("/explore", current, { year: y })}
      />
      )}

      {tab === "tags" && (
        <section aria-label="태그" className="px-4 pt-4 md:px-6">
          {matchedTags.length === 0 ? (
            <p className="py-12 text-center text-sm text-quiet">맞는 태그가 없어요.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {matchedTags.map((tag) => (
                <li key={tag.id}>
                  <TagChip tag={tag} showKind />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "creators" && (
        <section aria-label="크리에이터" className="px-4 pt-4 md:px-6">
          {creators.length === 0 ? (
            <p className="py-12 text-center text-sm text-quiet">맞는 회원이 없어요.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {creators.map((c) => (
                <li key={c.handle}>
                  <Link href={profileHref(c.handle)} className="flex min-h-12 items-baseline gap-2 py-2 hover:text-text">
                    <span className="font-semibold">@{c.handle}</span>
                    <span className="truncate text-sm text-quiet">{c.display_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "events" && (
        <section aria-label="행사" className="px-4 pt-4 md:px-6">
          {events.length === 0 ? (
            <p className="py-12 text-center text-sm text-quiet">맞는 행사가 없어요.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="flex min-h-12 items-center gap-3 py-2 hover:text-text">
                    <span className="w-24 shrink-0 text-sm tabular-nums text-quiet">{formatRange(e.starts_on, e.ends_on)}</span>
                    <span className="truncate">{e.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aroundEvents.length > 0 && (
        <section aria-labelledby="events-heading" className="px-4 pb-2 md:px-6">
          <h2 id="events-heading" className="flex items-center justify-between text-sm font-semibold">
            행사
            <Link href="/events" className="text-xs font-normal text-quiet hover:underline">
              캘린더 ›
            </Link>
          </h2>
          <ul className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {aroundEvents.slice(0, 10).map((e) => (
              <li key={e.id} className="shrink-0">
                <Link href={`/events/${e.id}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm hover:border-quiet">
                  <span className="tabular-nums text-quiet">{formatRange(e.starts_on, e.ends_on)}</span>
                  {e.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "posts" && matchedTags.length > 0 && (
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

      {tab === "posts" && (
        <nav aria-label="정렬" className="flex items-center gap-1 px-4 pb-2 text-sm md:px-6">
          {(["latest", "popular"] as const).map((s) => (
            <Link
              key={s}
              href={feedHref("/explore", current, { sort: s })}
              aria-current={sort === s ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-quiet hover:text-text aria-[current=page]:font-semibold aria-[current=page]:text-text"
            >
              {s === "latest" ? "최신순" : "인기순"}
            </Link>
          ))}
          {sort === "popular" && <span className="text-xs text-quiet">최근 {POPULAR_DAYS}일 좋아요</span>}
        </nav>
      )}

      {tab === "posts" && filtered && (
        <p className="flex items-center gap-3 px-4 pb-2 text-sm text-quiet md:px-6">
          {first.items.length === 0 ? "찾는 사진이 없어요." : `${first.items.length}개${first.next ? " 이상" : ""}`}
          <Link href="/explore" className="underline underline-offset-4">
            조건 지우기
          </Link>
        </p>
      )}

      {tab === "posts" && (
        <FeedList
          key={JSON.stringify(scope)}
          scope={scope}
          initial={first}
          empty={
            sort === "popular"
              ? `최근 ${POPULAR_DAYS}일 동안 좋아요를 받은 사진이 없어요.`
              : filtered
                ? "다른 검색어나 조건으로 찾아보세요."
                : "아직 담긴 사진이 없어요."
          }
        />
      )}
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

/** 핸들 · 표시 이름으로 회원 찾기 (탈퇴 유예 · 차단은 RLS가 뺀다) */
async function findCreators(text: string) {
  const supabase = await createClient();
  // PostgREST 필터 문법 문자는 지운다 (검색어가 조건을 바꾸지 못하게)
  const like = escapeLike(text.replace(/^@/, "").replace(/[,()*:."']/g, ""));
  if (!like) return [];
  const { data } = await supabase
    .from("profiles")
    .select("handle, display_name")
    .or(`handle.ilike.${like}*,display_name.ilike.*${like}*`)
    .order("handle")
    .limit(30);
  return data ?? [];
}

/** 이름으로 공식 행사 찾기 (최근 것부터) */
async function findEvents(text: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, name, starts_on, ends_on")
    .eq("status", "official")
    .ilike("name", `%${escapeLike(text)}%`)
    .order("starts_on", { ascending: false })
    .limit(30);
  return data ?? [];
}
