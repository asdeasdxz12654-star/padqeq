import Link from "next/link";
import { Suspense } from "react";
import { FeedList } from "@/components/feed-list";
import { EventSection, ExhibitionSection, HomeHero, LatestSection, PicksRow, SeasonSection, ShelfSection, TagSection } from "@/components/home/home-sections";
import { OnThisDay } from "@/components/on-this-day";
import { YearChips } from "@/components/year-chips";
import { getViewer } from "@/lib/auth/viewer";
import { followedFeed } from "@/lib/follows/follows";
import { loadDailyPicks } from "@/lib/posts/daily-picks";
import { type FeedScope, type HomeFeed, parseHomeFeed } from "@/lib/posts/feed-scope";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { loadHomeSections } from "@/lib/posts/home-sections";
import { loadOnThisDay } from "@/lib/posts/on-this-day";
import { createClient } from "@/lib/supabase/server";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";

const tab = "inline-flex min-h-9 items-center rounded-lg px-4 text-sm";

const TABS: { feed: HomeFeed; label: string; memberOnly?: boolean }[] = [
  { feed: "recommended", label: "추천" },
  { feed: "latest", label: "최신" },
  { feed: "following", label: "팔로우", memberOnly: true },
];

// S-02 홈 (디자인 개편 v2): 기본(추천)은 주제별 섹션 — 오늘의 픽 · 이맘때 · 전시 · 코스프레 · 인물 · 풍경 · 계절 · 행사 · 많이 찍는 작품 · 새로 담긴 사진.
// 최신 · 팔로우 · 촬영 연도를 고르면 예전처럼 끝없이 이어지는 사진 목록.
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const year = parseYearParam(params.year);
  // 기본 홈이면 로그인 확인을 기다리지 않고 첫 화면 조회부터 시작한다 (?feed가 없으면 늘 추천)
  const early = params.feed === undefined && year === null ? { memories: loadOnThisDay(), picks: loadDailyPicks(), latest: loadScopePage({ kind: "home", year: null, feed: "latest" }) } : null;
  const viewer = await getViewer();
  const feed = parseHomeFeed(params.feed, Boolean(viewer?.profile));
  const supabase = await createClient();

  const follows = feed === "following" && viewer ? await followedFeed(viewer.id) : undefined;
  const scope: FeedScope = { kind: "home", year, feed };
  const sectionsView = feed === "recommended" && year === null;
  const member = Boolean(viewer?.profile);
  // 기본 홈: 첫 화면(큰 사진 · 이맘때 · 오늘의 픽)만 먼저 그려 보내고, 나머지 섹션은 뒤이어 (큰 사진을 빨리 받기 시작하게)
  const [years, first, memories, picks] = await Promise.all([
    sectionsView ? null : supabase.rpc("published_shot_years"),
    sectionsView ? Promise.resolve({ items: [], next: null }) : loadScopePage(scope),
    // N년 전 이맘때 · 오늘의 픽 · 섹션은 기본 홈에서만
    sectionsView ? (early?.memories ?? loadOnThisDay()) : Promise.resolve([]),
    sectionsView ? (early?.picks ?? loadDailyPicks()) : Promise.resolve(null),
  ]);
  // 오늘의 픽이 없으면 가장 최근 사진을 큰 칸에
  const heroPick =
    picks?.items[0] ?? (sectionsView ? ((await (early?.latest ?? loadScopePage({ kind: "home", year: null, feed: "latest" }))).items[0] ?? null) : null);
  if (years?.error) throw years.error;

  const href = (opts: { year: number | null; feed: HomeFeed }) => {
    const q = new URLSearchParams();
    if (opts.feed !== "recommended") q.set("feed", opts.feed);
    if (opts.year !== null) q.set("year", String(opts.year));
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <h1 className="sr-only">
        {feed === "following" ? "팔로우한 태그 · 회원의 사진" : feed === "latest" ? "최신 사진" : "추천 사진"}
        {year ? ` · ${year}년` : ""}
      </h1>
      <nav aria-label="피드" className="mx-4 mt-3 flex w-fit gap-1 rounded-xl bg-surface p-1 md:mx-6">
        {TABS.filter((t) => !t.memberOnly || viewer?.profile).map((t) => (
          <Link
            prefetch={false}
            key={t.feed}
            href={href({ year, feed: t.feed })}
            aria-current={feed === t.feed ? "page" : undefined}
            className={`${tab} ${feed === t.feed ? "bg-bg font-bold text-text shadow-sm" : "text-quiet hover:text-text"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {sectionsView ? (
        <div id="sections" className="flex scroll-mt-16 flex-col gap-10 pb-16 md:gap-14">
          <HomeHero pick={heroPick} member={member} />
          <OnThisDay items={memories} />
          {/* 큰 칸에 쓴 첫 픽은 줄에서 뺀다 */}
          <PicksRow items={picks?.items.slice(1) ?? []} />
          <Suspense fallback={<SectionsSkeleton />}>
            <RestSections member={member} />
          </Suspense>
        </div>
      ) : (
        <>
          <YearChips chips={buildYearChips((years?.data ?? []).map((row) => row.year))} selected={year} hrefFor={(y) => href({ year: y, feed })} />
          {feed === "recommended" && year !== null && (
            <p className="px-4 pb-2 text-xs text-quiet md:px-6">연도를 고르면 그해 사진을 최신순으로 보여 줘요.</p>
          )}
          {feed === "following" && follows?.tagIds.length === 0 && follows.authorIds.length === 0 ? (
            <p className="px-4 py-24 text-center text-sm leading-relaxed text-quiet md:px-6">
              아직 팔로우한 태그나 회원이 없어요.
              <br />
              <Link href="/explore" className="font-semibold text-text underline underline-offset-4">
                탐색
              </Link>
              에서 좋아하는 작품 · 캐릭터 · 장소 태그나 작가 · 모델을 팔로우해 보세요.
            </p>
          ) : (
            <FeedList
              key={JSON.stringify(scope)}
              scope={scope}
              initial={first}
              empty={
                feed === "following"
                  ? year
                    ? `${year}년에 팔로우한 태그 · 회원의 사진이 아직 없어요.`
                    : "팔로우한 태그 · 회원의 사진이 아직 없어요."
                  : year
                    ? `${year}년에 담긴 사진이 아직 없어요.`
                    : "아직 담긴 사진이 없어요."
              }
            />
          )}
        </>
      )}
    </div>
  );
}

/** 첫 화면 아래 섹션: 전시 · 분류별 · 계절 · 행사 · 많이 찍는 작품 · 새로 담긴 사진 */
async function RestSections({ member }: { member: boolean }) {
  const sections = await loadHomeSections();
  return (
    <>
      <ExhibitionSection shows={sections.exhibitions} />
      {sections.shelves.map((shelf) => (
        <ShelfSection key={shelf.category} shelf={shelf} />
      ))}
      <SeasonSection shelf={sections.season} />
      <EventSection events={sections.events} />
      <TagSection tags={sections.tags} />
      <LatestSection items={sections.latest} member={member} />
    </>
  );
}

function SectionsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 px-4 md:px-6">
      <div className="h-6 w-32 rounded-md bg-slot motion-safe:animate-pulse" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="aspect-[4/5] w-40 shrink-0 rounded-lg bg-slot motion-safe:animate-pulse md:w-1/5" />
        ))}
      </div>
    </div>
  );
}
