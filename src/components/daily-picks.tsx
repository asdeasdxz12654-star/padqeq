import Link from "next/link";
import type { FeedItem } from "@/lib/posts/feed";
import { profileHref } from "@/lib/profiles/profile-href";
import { ProtectedPhoto } from "./protected-photo";
import { Veil } from "./veil";

/** 홈 상단 "오늘의 픽" (운영자가 고른 글, 가로로 넘겨 보기). 없으면 그리지 않는다. */
export function DailyPicks({ picks }: { picks: { date: string; items: FeedItem[] } | null }) {
  if (!picks) return null;
  return (
    <section aria-labelledby="daily-picks" className="px-4 pt-2 pb-4 md:px-6">
      <h2 id="daily-picks" className="mb-2 text-base font-semibold">
        오늘의 픽
      </h2>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6">
        {picks.items.map((post, i) => (
          <li key={post.id} className="w-40 shrink-0 snap-start md:w-56">
            <article className="relative">
              <div className="aspect-[4/5] overflow-hidden rounded-lg bg-slot [&_picture]:h-full">
                {post.cover && (
                  <Veil postId={post.id} reason={post.cover.veil} fill>
                    <ProtectedPhoto
                      sources={post.cover.sources}
                      alt={post.cover.alt}
                      width={post.cover.width}
                      height={post.cover.height}
                      sizes="224px"
                      priority={i < 2}
                      className="block size-full object-cover"
                    />
                  </Veil>
                )}
              </div>
              <h3 className="truncate px-1 pt-1.5 text-sm">
                <Link href={`/p/${post.id}`} className="after:absolute after:inset-0">
                  {post.title}
                </Link>
              </h3>
              <p className="truncate px-1 text-xs text-quiet">
                <Link href={profileHref(post.handle)} className="relative z-10 hover:text-text">
                  @{post.handle}
                </Link>
              </p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
