import Link from "next/link";
import { OnThisDay } from "@/components/on-this-day";
import { PhotoFeed } from "@/components/photo-feed";
import { YearChips } from "@/components/year-chips";
import { getViewer } from "@/lib/auth/viewer";
import { loadFeed } from "@/lib/posts/feed";
import { loadOnThisDay } from "@/lib/posts/on-this-day";
import { createClient } from "@/lib/supabase/server";
import { followedFeed } from "@/lib/follows/follows";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";

const tab = "inline-flex min-h-10 items-center rounded-full px-4 text-sm";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const year = parseYearParam(params.year);
  const viewer = await getViewer();
  // 팔로우 피드는 로그인한 회원만 (?feed=following)
  const following = params.feed === "following" && Boolean(viewer?.profile);
  const supabase = await createClient();

  const follows = following && viewer ? await followedFeed(viewer.id) : undefined;
  const [years, items, memories] = await Promise.all([
    supabase.rpc("published_shot_years"),
    loadFeed({ year, category: null, query: null, following: follows }),
    // N년 전 이맘때는 전체 보기에서만
    year === null && !following ? loadOnThisDay() : Promise.resolve([]),
  ]);
  if (years.error) throw years.error;

  const href = (opts: { year: number | null; following: boolean }) => {
    const q = new URLSearchParams();
    if (opts.following) q.set("feed", "following");
    if (opts.year !== null) q.set("year", String(opts.year));
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <h1 className="sr-only">
        {following ? "팔로우한 태그 · 회원의 사진" : "전체 사진"}
        {year ? ` · ${year}년` : ""}
      </h1>
      {viewer?.profile && (
        <nav aria-label="피드" className="flex gap-1 px-4 pt-3 md:px-6">
          {[
            { label: "전체", on: !following, to: href({ year, following: false }) },
            { label: "팔로우", on: following, to: href({ year, following: true }) },
          ].map((t) => (
            <Link
              key={t.label}
              href={t.to}
              aria-current={t.on ? "page" : undefined}
              className={`${tab} ${t.on ? "bg-surface font-semibold text-text" : "text-quiet hover:text-text"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      <YearChips
        chips={buildYearChips(years.data.map((row) => row.year))}
        selected={year}
        hrefFor={(y) => href({ year: y, following })}
      />
      <OnThisDay items={memories} />
      {following && follows?.tagIds.length === 0 && follows.authorIds.length === 0 ? (
        <p className="px-4 py-24 text-center text-sm leading-relaxed text-quiet md:px-6">
          아직 팔로우한 태그나 회원이 없어요.
          <br />
          <Link href="/explore" className="font-semibold text-text underline underline-offset-4">
            탐색
          </Link>
에서 좋아하는 작품 · 캐릭터 · 장소 태그나 작가 · 모델을 팔로우해 보세요.
        </p>
      ) : (
        <PhotoFeed
          items={items}
          empty={
            following
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
