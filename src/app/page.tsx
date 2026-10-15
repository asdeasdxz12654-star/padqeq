import Link from "next/link";
import { DailyPicks } from "@/components/daily-picks";
import { FeedList } from "@/components/feed-list";
import { OnThisDay } from "@/components/on-this-day";
import { YearChips } from "@/components/year-chips";
import { getViewer } from "@/lib/auth/viewer";
import { followedFeed } from "@/lib/follows/follows";
import { loadDailyPicks } from "@/lib/posts/daily-picks";
import { type FeedScope, type HomeFeed, parseHomeFeed } from "@/lib/posts/feed-scope";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { loadOnThisDay } from "@/lib/posts/on-this-day";
import { createClient } from "@/lib/supabase/server";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";

const tab = "inline-flex min-h-10 items-center rounded-full px-4 text-sm";

const TABS: { feed: HomeFeed; label: string; memberOnly?: boolean }[] = [
  { feed: "recommended", label: "추천" },
  { feed: "latest", label: "최신" },
  { feed: "following", label: "팔로우", memberOnly: true },
];

// S-02 홈: 추천(큐레이션 · 팔로우 · 반응 · 관심 분야를 섞은 순서, 기본) · 최신 · 팔로우(시간순, 회원만) + 촬영 연도
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const year = parseYearParam(params.year);
  const viewer = await getViewer();
  const feed = parseHomeFeed(params.feed, Boolean(viewer?.profile));
  const supabase = await createClient();

  const follows = feed === "following" && viewer ? await followedFeed(viewer.id) : undefined;
  const scope: FeedScope = { kind: "home", year, feed };
  const extras = year === null && feed !== "following";
  const [years, first, memories, picks] = await Promise.all([
    supabase.rpc("published_shot_years"),
    loadScopePage(scope),
    // N년 전 이맘때 · 오늘의 픽은 연도를 고르지 않은 추천 · 최신에서만
    extras ? loadOnThisDay() : Promise.resolve([]),
    extras ? loadDailyPicks() : Promise.resolve(null),
  ]);
  if (years.error) throw years.error;

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
      <nav aria-label="피드" className="flex gap-1 px-4 pt-3 md:px-6">
        {TABS.filter((t) => !t.memberOnly || viewer?.profile).map((t) => (
          <Link
            key={t.feed}
            href={href({ year, feed: t.feed })}
            aria-current={feed === t.feed ? "page" : undefined}
            className={`${tab} ${feed === t.feed ? "bg-surface font-semibold text-text" : "text-quiet hover:text-text"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <YearChips chips={buildYearChips(years.data.map((row) => row.year))} selected={year} hrefFor={(y) => href({ year: y, feed })} />
      <DailyPicks picks={picks} />
      <OnThisDay items={memories} />
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
    </div>
  );
}
