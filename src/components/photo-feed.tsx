import Link from "next/link";
import type { FeedItem } from "@/lib/posts/feed";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import { profileHref } from "@/lib/profiles/profile-href";
import { ProtectedPhoto } from "./protected-photo";
import { Veil } from "./veil";

const badge = "pointer-events-none absolute top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white";

/** 사진 피드 (홈 · 탐색 · 태그 · 프로필 공용). 열 수: 2 · 3(md) · 5(xl). 여러 장 · 파노라마는 배지로 (S-02 ④ ⑨) */
export function PhotoFeed({ items, empty }: { items: FeedItem[]; empty: string }) {
  if (items.length === 0) return <p className="px-4 py-24 text-center text-quiet md:px-6">{empty}</p>;

  return (
    <ul className="columns-2 gap-2 px-2 md:columns-3 md:px-6 xl:columns-5 xl:gap-4">
      {items.map((post, index) => (
        <li key={post.id} className="mb-2 break-inside-avoid xl:mb-4">
          <article className="relative">
            {post.cover ? (
              <div className={`relative overflow-hidden rounded-lg bg-slot ${post.cover.isPanorama ? "aspect-[2/1]" : ""}`}>
                <Veil postId={post.id} reason={post.cover.veil} fill={post.cover.isPanorama}>
                  <ProtectedPhoto
                    sources={post.cover.sources}
                    alt={post.cover.alt}
                    width={post.cover.width}
                    height={post.cover.height}
                    sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw"
                    priority={index < 4}
                    className={`block w-full ${post.cover.isPanorama ? "h-full object-cover" : "h-auto"}`}
                  />
                </Veil>
                {post.cover.isPanorama && <span className={`${badge} left-1.5`}>파노라마</span>}
                {post.photoCount > 1 && (
                  <span className={`${badge} right-1.5 tabular-nums`}>
                    <span className="sr-only">사진 </span>
                    {post.photoCount}
                    <span className="sr-only">장</span>
                  </span>
                )}
              </div>
            ) : (
              <div role="img" aria-label={post.title} className="aspect-[4/5] rounded-lg bg-slot" />
            )}
            <div className="px-1 pt-2 pb-1">
              <h2 className="truncate text-sm font-medium">
                {/* 카드 전체를 누를 수 있게 (링크 영역을 카드로 넓힘) */}
                <Link prefetch={false} href={`/p/${post.id}`} className="after:absolute after:inset-0">
                  {post.title}
                </Link>
              </h2>
              <p className="text-xs text-quiet">
                <Link prefetch={false} href={profileHref(post.handle)} className="relative z-10 hover:text-text">
                  @{post.handle}
                </Link>{" "}
                · {CATEGORY_LABEL[post.category]} · {post.shotYear}
              </p>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
