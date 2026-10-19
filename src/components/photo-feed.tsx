"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useSyncExternalStore } from "react";
import { LineArt } from "./line-art";
import type { FeedItem } from "@/lib/posts/feed";
import { masonryColumns } from "@/lib/posts/masonry";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import { profileHref } from "@/lib/profiles/profile-href";
import { ProtectedPhoto } from "./protected-photo";
import { FeedOrderCapture } from "./feed-order";
import { Veil } from "./veil";

const badge = "pointer-events-none absolute top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white";

/** 사진 피드 (홈 · 탐색 · 태그 · 프로필 공용). 열 수: 2 · 3(md) · 5(xl), 가로 순서를 지키는 메이슨리. 여러 장 · 파노라마는 배지로 (S-02 ④ ⑨) */
export function PhotoFeed({ items, empty, after }: { items: FeedItem[]; empty: string; /** 이 글 뒤에 붙일 칸 (팔로우 피드 묶음 '더 보기') */ after?: (post: FeedItem) => ReactNode }) {
  const columns = useSyncExternalStore(subscribeColumns, readColumns, () => 0);
  if (items.length === 0)
    return empty ? (
      <div className="flex flex-col items-center gap-3 px-4 py-20 text-center md:px-6">
        <LineArt kind="empty" />
        <p className="text-quiet">{empty}</p>
      </div>
    ) : null;

  // 처음 그릴 때는 화면 폭을 몰라 열 배치를 세 벌 만들고 CSS로 하나만 보인다 (숨긴 배치의 사진은 받지 않는다: 지연 로딩).
  // 브라우저가 화면 폭을 알면 맞는 한 벌만 남긴다 (더 불러와도 사진 수가 세 배로 늘지 않게)
  return (
    <FeedOrderCapture>
    <div className="px-2 md:px-6">
      {LAYOUTS.filter((layout) => columns === 0 || layout.columns === columns).map((layout) => (
        <div key={layout.columns} className={`${columns === 0 ? layout.className : "flex"} items-start gap-2 xl:gap-4`}>
          {masonryColumns(items, layout.columns, (post) => cardHeight(post, Boolean(after?.(post)))).map((column, c) => (
            <ul key={c} className="flex min-w-0 flex-1 flex-col gap-2 xl:gap-4">
              {column.map(({ item: post, index }) => (
                <Fragment key={post.id}>
                  <Card post={post} index={index} />
                  {after?.(post)}
                </Fragment>
              ))}
            </ul>
          ))}
        </div>
      ))}
    </div>
    </FeedOrderCapture>
  );
}

// 열 수: 2 · 3(md 768px~) · 5(xl 1280px~). 0은 아직 모름 (서버 · 첫 그리기)
const MEDIA = ["(min-width: 1280px)", "(min-width: 768px)"] as const;
function readColumns(): number {
  return window.matchMedia(MEDIA[0]).matches ? 5 : window.matchMedia(MEDIA[1]).matches ? 3 : 2;
}
function subscribeColumns(notify: () => void) {
  const lists = MEDIA.map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener("change", notify));
  return () => lists.forEach((l) => l.removeEventListener("change", notify));
}

const LAYOUTS = [
  { columns: 2, className: "flex md:hidden" },
  { columns: 3, className: "hidden md:flex xl:hidden" },
  { columns: 5, className: "hidden xl:flex" },
] as const;

/** 열 너비를 1로 본 카드 높이 어림 (사진 + 제목 · 작가 두 줄, 덧붙인 칸) */
function cardHeight(post: FeedItem, hasAfter: boolean): number {
  const photo = !post.cover ? 1.25 : post.cover.isPanorama ? 0.5 : post.cover.height / Math.max(1, post.cover.width);
  return photo + 0.3 + (hasAfter ? 0.45 : 0);
}

function Card({ post, index }: { post: FeedItem; index: number }) {
  return (
    <li data-feed-id={post.id} data-feed-index={index}>
      <article className="relative">
        {post.cover ? (
          <div
            className={`relative overflow-hidden rounded-lg bg-slot ${post.cover.isPanorama ? "aspect-[2/1]" : ""}`}
            style={post.cover.color && !post.cover.veil ? { backgroundColor: post.cover.color } : undefined}
          >
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
  );
}
