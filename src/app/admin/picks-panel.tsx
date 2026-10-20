"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setExhibition } from "@/app/c/[id]/exhibit-actions";
import { setDailyPick } from "@/app/p/[id]/actions";
import { ProtectedPhoto } from "@/components/protected-photo";
import type { PicksPanel as Data } from "@/lib/admin/picks";
import type { FeedItem } from "@/lib/posts/feed";
import { copyLatestPicks, reorderTodayPicks } from "./picks-actions";

const MAX_PICKS = 10;

/** 대시보드 '오늘의 픽' 칸: 고른 글 · 순서 · 빼기 · 후보에서 더하기 (홈 맨 위에 이 순서로) */
export function PicksPanel({ data }: { data: Data }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (job: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await job();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  const ids = data.picks.map((p) => p.id);
  const move = (index: number, delta: number) => {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    run(() => reorderTodayPicks(next));
  };
  const full = ids.length >= MAX_PICKS;

  return (
    <section aria-labelledby="picks-heading" className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id="picks-heading" className="text-lg font-semibold">
          오늘의 픽
        </h2>
        <span className="text-xs text-quiet">
          {data.date.slice(5).replace("-", "월 ")}일 · {ids.length} / {MAX_PICKS} · 홈 맨 위에 이 순서로
        </span>
        {ids.length === 0 && (
          <button type="button" disabled={pending} onClick={() => run(copyLatestPicks)} className="ml-auto min-h-9 rounded-lg border border-line px-3 text-sm hover:border-quiet disabled:opacity-50">
            지난 픽 이어 쓰기
          </button>
        )}
      </div>

      {ids.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-quiet">오늘 고른 글이 없어요. 아래 후보에서 골라 주세요. 없으면 홈에는 가장 최근 사진이 크게 나와요.</p>
      ) : (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {data.picks.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-1">
              <Thumb post={p} badge={String(i + 1)} />
              <div className="grid grid-cols-3 gap-1 text-xs">
                <button type="button" aria-label={`${p.title} 앞으로`} disabled={pending || i === 0} onClick={() => move(i, -1)} className="min-h-9 rounded-md border border-line disabled:opacity-30">
                  ←
                </button>
                <button type="button" aria-label={`${p.title} 뒤로`} disabled={pending || i === ids.length - 1} onClick={() => move(i, 1)} className="min-h-9 rounded-md border border-line disabled:opacity-30">
                  →
                </button>
                <button type="button" aria-label={`${p.title} 빼기`} disabled={pending} onClick={() => run(() => setDailyPick(p.id, false))} className="min-h-9 rounded-md border border-line">
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-1 text-sm font-semibold">
        후보 <span className="text-xs font-normal text-quiet">최근 3일 공개 글 · 좋아요 많은 순 · 이미 고른 글 · 가림 · 숨긴 글은 빼고</span>
      </p>
      {data.candidates.length === 0 ? (
        <p className="text-sm text-quiet">최근 3일 동안 새로 공개된 글이 없어요.</p>
      ) : (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {data.candidates.map((p) => (
            <li key={p.id} className="flex flex-col gap-1">
              <Thumb post={p} />
              <button
                type="button"
                disabled={pending || full}
                onClick={() => run(() => setDailyPick(p.id, true))}
                className="min-h-9 rounded-md bg-accent text-xs font-semibold text-on-accent disabled:opacity-40"
              >
                + 픽
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/** 전시 중인 컬렉션 (내리기) */
export function ExhibitList({ exhibits }: { exhibits: Data["exhibits"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (exhibits.length === 0) return <p className="text-sm text-quiet">전시 중인 컬렉션이 없어요. 컬렉션 화면에서 전시할 수 있어요.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line text-sm">
      {exhibits.map((c) => (
        <li key={c.id} className="flex items-center gap-2 py-2">
          <Link href={`/c/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
            {c.title} <span className="text-xs text-quiet">@{c.owner}</span>
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setExhibition({ id: c.id, on: false, note: "대시보드에서 전시 내림" });
                setError(result.ok ? null : result.error);
                router.refresh();
              })
            }
            className="min-h-9 shrink-0 rounded-lg border border-line px-3 text-sm hover:border-quiet"
          >
            내리기
          </button>
        </li>
      ))}
      {error && <li className="py-2 text-sm text-danger">{error}</li>}
    </ul>
  );
}

function Thumb({ post, badge }: { post: FeedItem; badge?: string }) {
  return (
    <Link href={`/p/${post.id}`} title={post.title} className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-slot [&_picture]:h-full">
      {post.cover && !post.cover.veil && (
        <ProtectedPhoto sources={post.cover.sources} alt={post.title} width={post.cover.width} height={post.cover.height} sizes="120px" className="block size-full object-cover" />
      )}
      {badge && <span className="absolute top-1 left-1 rounded-md bg-bg/85 px-1.5 text-xs font-bold">{badge}</span>}
    </Link>
  );
}
