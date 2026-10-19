"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

// 피드에서 연 게시물의 '이전 글 · 다음 글': 피드에서 카드를 누를 때 그 피드의 글 순서를 이 탭에만 잠깐 기억한다.
const KEY = "haedam:feed-order";
const MAX = 300;
const noop = () => () => {};

/** 피드를 감싸 카드를 누를 때 순서를 기억한다 (화면 폭마다 배치가 세 벌이라 순번으로 정렬 · 중복 제거) */
export function FeedOrderCapture({ children }: { children: React.ReactNode }) {
  return (
    <div
      onClickCapture={(e) => {
        const link = (e.target as Element).closest?.('a[href^="/p/"]');
        if (!link) return;
        const seen = new Map<string, number>();
        e.currentTarget.querySelectorAll<HTMLElement>("[data-feed-id]").forEach((el) => {
          const id = el.dataset.feedId!;
          if (!seen.has(id)) seen.set(id, Number(el.dataset.feedIndex));
        });
        const ids = [...seen].sort((a, b) => a[1] - b[1]).map(([id]) => id).slice(0, MAX);
        try {
          sessionStorage.setItem(KEY, JSON.stringify(ids));
        } catch {
          // 저장할 수 없으면 이전 · 다음 버튼만 나오지 않는다
        }
      }}
    >
      {children}
    </div>
  );
}

function readOrder(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/** 게시물 창 아래의 이전 글 · 다음 글 (피드에서 열었을 때만). 넘겨도 창을 닫으면 피드의 보던 자리로 돌아간다. */
export function PostNeighbors() {
  const router = useRouter();
  const pathname = usePathname();
  const raw = useSyncExternalStore(noop, readOrder, () => "[]");
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    ids = [];
  }
  const current = pathname.startsWith("/p/") ? decodeURIComponent(pathname.slice(3).split("/")[0] ?? "") : "";
  const at = ids.indexOf(current);
  if (at < 0) return null;
  const prev = ids[at - 1];
  const next = ids[at + 1];
  if (!prev && !next) return null;

  const button = "flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-line bg-bg px-4 text-sm font-semibold hover:border-quiet disabled:opacity-40";
  return (
    <nav aria-label="피드의 다른 게시물" className="sticky bottom-0 z-10 flex gap-2 border-t border-line bg-bg/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:px-6">
      {/* 창 안에서 바꿔 가며 보고, 닫으면 한 번에 피드로 (기록을 쌓지 않는다) */}
      <button type="button" disabled={!prev} onClick={() => prev && router.replace(`/p/${prev}`, { scroll: false })} className={button}>
        ‹ 이전 글
      </button>
      <button type="button" disabled={!next} onClick={() => next && router.replace(`/p/${next}`, { scroll: false })} className={button}>
        다음 글 ›
      </button>
    </nav>
  );
}
