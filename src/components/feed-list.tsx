"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { loadMoreFeed } from "@/app/feed-actions";
import type { FeedItem, FeedPage } from "@/lib/posts/feed";
import type { FeedScope } from "@/lib/posts/feed-scope";
import { foldRuns } from "@/lib/posts/fold-runs";
import { ImmersiveFeed } from "./immersive-feed";
import { PhotoFeed } from "./photo-feed";

/**
 * 이어 보기 피드 (S-02 ④). 첫 페이지는 서버가 그리고, 끝에 닿으면 다음 페이지를 붙인다.
 * 자동으로 안 될 때(구형 브라우저 · 스크린 리더)를 위해 '더 보기' 버튼도 둔다.
 * 조건이 바뀌면 처음부터 다시 그리도록 쓰는 쪽에서 key를 조건으로 준다.
 */
export function FeedList({
  scope,
  initial,
  lead = [],
  empty,
}: {
  scope: FeedScope;
  initial: FeedPage;
  /** 첫 페이지 앞에 붙일 글 (프로필 고정 글). 뒤 페이지에서는 같은 글을 빼고 보여 준다. */
  lead?: FeedItem[];
  empty: string;
}) {
  const leadIds = new Set(lead.map((p) => p.id));
  const [items, setItems] = useState(() => [...lead, ...initial.items.filter((p) => !leadIds.has(p.id))]);
  const [next, setNext] = useState(initial.next);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  // 팔로우 피드: 한 작가의 글이 줄줄이 이어지면 접는다
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const folded = scope.kind === "home" && scope.feed === "following" ? foldRuns(items, opened) : null;

  const more = () => {
    if (!next || pending) return;
    setFailed(false);
    startTransition(async () => {
      try {
        const page = await loadMoreFeed(scope, next);
        setItems((list) => {
          const seen = new Set(list.map((p) => p.id));
          return [...list, ...page.items.filter((p) => !seen.has(p.id))];
        });
        setNext(page.next);
      } catch {
        setFailed(true);
      }
    });
  };

  // 화면 끝에서 한 화면쯤 남았을 때 미리 불러온다
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || failed || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && more(), { rootMargin: "800px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  });

  return (
    <>
      <ImmersiveFeed items={folded?.visible ?? items} onNearEnd={more} hasMore={Boolean(next)} />
      <PhotoFeed
        items={folded?.visible ?? items}
        empty={empty}
        after={(post) => {
          const fold = folded?.folds.get(post.id);
          return fold ? (
            <li key={`fold-${fold.start}`}>
              <button
                type="button"
                onClick={() => setOpened((s) => new Set(s).add(fold.start))}
                className="flex min-h-20 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-line px-3 py-4 text-sm hover:border-quiet"
              >
                <span className="font-semibold">@{fold.handle}</span>
                <span className="text-quiet">게시물 {fold.hidden}개 더 보기</span>
              </button>
            </li>
          ) : null;
        }}
      />
      {next && (
        <div ref={sentinel} className="flex justify-center px-4 py-8">
          <button
            type="button"
            onClick={more}
            disabled={pending}
            className="min-h-11 rounded-full border border-line px-6 text-sm hover:border-quiet disabled:opacity-60"
          >
            {pending ? "불러오는 중…" : failed ? "다시 불러오기" : "더 보기"}
          </button>
        </div>
      )}
    </>
  );
}
