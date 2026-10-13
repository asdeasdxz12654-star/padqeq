import Link from "next/link";
import type { FeedItem } from "@/lib/posts/feed";
import { ProtectedPhoto } from "./protected-photo";

const CATEGORY_LABEL = { cosplay: "코스프레", model: "모델", landscape: "풍경", other: "기타" } as const;

/** 사진 피드 (홈 · 탐색 공용). 열 수: 2 · 3(md) · 5(xl) */
export function PhotoFeed({ items, empty }: { items: FeedItem[]; empty: string }) {
  if (items.length === 0) return <p className="px-4 py-24 text-center text-quiet md:px-6">{empty}</p>;

  return (
    <ul className="columns-2 gap-2 px-2 md:columns-3 md:px-6 xl:columns-5 xl:gap-4">
      {items.map((post, index) => (
        <li key={post.id} className="mb-2 break-inside-avoid xl:mb-4">
          <article className="relative">
            {post.cover ? (
              <div className={`overflow-hidden rounded-lg bg-slot ${post.cover.isPanorama ? "aspect-[2/1]" : ""}`}>
                <ProtectedPhoto
                  sources={post.cover.sources}
                  alt={post.cover.alt}
                  width={post.cover.width}
                  height={post.cover.height}
                  sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw"
                  priority={index < 4}
                  className={`block w-full ${post.cover.isPanorama ? "h-full object-cover" : "h-auto"}`}
                />
              </div>
            ) : (
              <div role="img" aria-label={post.title} className="aspect-[4/5] rounded-lg bg-slot" />
            )}
            <div className="px-1 pt-2 pb-1">
              <h2 className="truncate text-sm font-medium">
                {/* 카드 전체를 누를 수 있게 (링크 영역을 카드로 넓힘) */}
                <Link href={`/p/${post.id}`} className="after:absolute after:inset-0">
                  {post.title}
                </Link>
              </h2>
              <p className="text-xs text-quiet">
                @{post.handle} · {CATEGORY_LABEL[post.category]} · {post.shotYear}
              </p>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
