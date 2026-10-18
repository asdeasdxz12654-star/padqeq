import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PhotoFeed } from "@/components/photo-feed";
import { ProtectedPhoto } from "@/components/protected-photo";
import { TagChip } from "@/components/tag-chip";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/photos/post-input";
import { type FeedItem, loadFeed, loadFeedByIds } from "@/lib/posts/feed";
import { profileHref } from "@/lib/profiles/profile-href";
import { busiestMonth, monthBars, shareCardContent, yearReviewSchema } from "@/lib/review/year-review";
import { createClient } from "@/lib/supabase/server";
import { currentYearKst, parseYearParam } from "@/lib/year-chips";
import { YearShareCard } from "./share-card";

export const metadata: Metadata = { title: "나의 한 해", robots: { index: false } };

// 나의 한 해 (개인 연말 결산). 본인만 본다. 기준은 촬영 연도.
export default async function YearReviewPage({ searchParams }: PageProps<"/me/year">) {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/year"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/year"));

  const year = parseYearParam((await searchParams).year) ?? currentYearKst();
  const supabase = await createClient();
  const [reviewResult, yearRows, items] = await Promise.all([
    supabase.rpc("my_year_review", { target_year: year }),
    supabase.from("posts").select("shot_year").eq("author_id", viewer.id).eq("status", "published").limit(1000),
    loadFeed({ year, category: null, query: null, authorId: viewer.id }),
  ]);
  if (reviewResult.error) throw reviewResult.error;
  const review = yearReviewSchema.parse(reviewResult.data);

  const years = [...new Set([currentYearKst(), ...(yearRows.data ?? []).map((r) => r.shot_year)])].sort((a, b) => b - a);
  const bookends = [review.first_post, review.last_post].filter((id): id is string => id !== null);
  const covers = new Map<string, FeedItem>(
    (await loadFeedByIds(bookends)).map((p) => [p.id, p]),
  );
  const busiest = busiestMonth(review.months);

  // 앞의 요약 · 처음과 끝은 카드라 이미 나뉜다. 제목이 달린 묶음(달마다 · 분류 · 태그 · 함께한 사람 · 사진)만 선으로 나눈다
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-10 pb-16 md:px-6 [&>section[aria-labelledby]]:border-t [&>section[aria-labelledby]]:border-line [&>section[aria-labelledby]]:pt-8">
      <header className="flex flex-col gap-4">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이
        </Link>
        <h1 className="text-3xl font-bold">나의 {year}</h1>
        <nav aria-label="연도" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {years.map((y) => (
            <Link
              key={y}
              href={`/me/year?year=${y}`}
              aria-current={y === year ? "page" : undefined}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
            >
              {y}
            </Link>
          ))}
        </nav>
      </header>

      {review.posts === 0 && review.credited_in === 0 ? (
        <p className="rounded-xl border border-line px-4 py-16 text-center text-sm leading-relaxed text-quiet">
          {year}년에 찍은 사진이 아직 없어요.
          <br />
          사진을 올리면 촬영 연도별로 이곳에 모여요.
        </p>
      ) : (
        <>
          <section aria-label="요약" className="grid grid-cols-3 gap-2">
            {[
              { label: "게시물", value: review.posts },
              { label: "사진", value: review.photos },
              { label: "크레딧된 작업", value: review.credited_in },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-1 rounded-xl border border-line p-4">
                <span className="text-2xl font-bold tabular-nums md:text-3xl">{s.value.toLocaleString("ko-KR")}</span>
                <span className="text-xs text-quiet">{s.label}</span>
              </div>
            ))}
          </section>

          {bookends.length > 0 && (
            <section aria-label="올해의 처음과 끝" className="grid grid-cols-2 gap-2">
              {[
                { id: review.first_post, label: "처음 담은 사진" },
                { id: review.last_post, label: "마지막으로 담은 사진" },
              ].map(({ id, label }) => {
                const post = id ? covers.get(id) : undefined;
                return post ? (
                  <article key={label} className="relative">
                    <div className="aspect-[4/5] overflow-hidden rounded-xl bg-slot [&_picture]:h-full">
                      {post.cover && (
                        <ProtectedPhoto
                          sources={post.cover.sources}
                          alt={post.cover.alt}
                          width={post.cover.width}
                          height={post.cover.height}
                          sizes="(min-width: 768px) 384px, 50vw"
                          className="block size-full object-cover"
                        />
                      )}
                    </div>
                    <p className="pt-2 text-xs text-quiet">{label}</p>
                    <h2 className="truncate text-sm font-medium">
                      <Link href={`/p/${post.id}`} className="after:absolute after:inset-0">
                        {post.title}
                      </Link>
                    </h2>
                  </article>
                ) : (
                  <div key={label} />
                );
              })}
            </section>
          )}

          {review.posts > 0 && (
            <section aria-labelledby="months-heading" className="flex flex-col gap-3">
              <h2 id="months-heading" className="text-lg font-semibold">
                달마다 담은 게시물
              </h2>
              {busiest && <p className="text-sm text-quiet">{busiest}월에 가장 많이 담았어요.</p>}
              <ol className="grid h-36 grid-cols-12 items-end gap-1" aria-label="월별 게시물 수">
                {monthBars(review.months).map((bar) => (
                  <li key={bar.month} className="flex h-full flex-col items-center justify-end gap-1">
                    <span className="sr-only">
                      {bar.month}월 {bar.count}개
                    </span>
                    <span
                      aria-hidden="true"
                      className={`w-full rounded-t ${bar.count ? "bg-accent" : "bg-slot"}`}
                      style={{ height: `${Math.max(bar.ratio * 100, 4)}%` }}
                    />
                    <span aria-hidden="true" className="text-[10px] text-quiet tabular-nums">
                      {bar.month}
                    </span>
                  </li>
                ))}
              </ol>
              {review.undated > 0 && <p className="text-xs text-quiet">촬영 날짜를 모르는 게시물 {review.undated}개는 빠졌어요.</p>}
            </section>
          )}

          {review.posts > 0 && (
            <section aria-labelledby="category-heading" className="flex flex-col gap-3">
              <h2 id="category-heading" className="text-lg font-semibold">
                분야
              </h2>
              <ul className="flex flex-wrap gap-2 text-sm">
                {CATEGORIES.filter((c) => review.categories[c]).map((c) => (
                  <li key={c} className="rounded-full border border-line px-3 py-1.5">
                    {CATEGORY_LABEL[c]} <span className="text-quiet tabular-nums">{review.categories[c]}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.top_tags.length > 0 && (
            <section aria-labelledby="tags-heading" className="flex flex-col gap-3">
              <h2 id="tags-heading" className="text-lg font-semibold">
                많이 담은 태그
              </h2>
              <ul className="flex flex-wrap gap-2">
                {review.top_tags.map((t) => (
                  <li key={t.slug}>
                    <TagChip tag={t} showKind={t.kind !== "general"} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.partners.length > 0 && (
            <section aria-labelledby="partners-heading" className="flex flex-col gap-3">
              <h2 id="partners-heading" className="text-lg font-semibold">
                함께한 사람들
              </h2>
              <ul className="flex flex-wrap gap-2 text-sm">
                {review.partners.map((p) => (
                  <li key={p.handle}>
                    <Link href={profileHref(p.handle)} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 hover:border-quiet">
                      @{p.handle}
                      <span className="ml-1.5 text-xs text-quiet tabular-nums">{p.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.posts > 0 && (
            <YearShareCard year={year} handle={viewer.profile.handle} content={shareCardContent(review, (c) => CATEGORY_LABEL[c])} />
          )}

          {items.length > 0 && (
            <section aria-labelledby="photos-heading" className="-mx-4 flex flex-col gap-3 md:-mx-6">
              <h2 id="photos-heading" className="px-4 text-lg font-semibold md:px-6">
                {year}년의 사진
              </h2>
              <PhotoFeed items={items} empty="" />
            </section>
          )}
        </>
      )}
    </div>
  );
}
