import { Nanum_Pen_Script } from "next/font/google";
import Link from "next/link";
import type { FeedItem } from "@/lib/posts/feed";
import { profileHref } from "@/lib/profiles/profile-href";
import { PhotoFeed } from "./photo-feed";

// 연도 손글씨 (책장 · 속표지와 같은 글씨)
const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });

type Person = { handle: string; displayName: string };

/**
 * 함께한 기록 (해담다움 9번): 크레딧으로 이어진 두 사람의 연표.
 * "@작가 × @코스어 — 함께한 3년 · 촬영 12번". 승인된 크레딧이 있는 게시된 글만 (얼굴 인식 · 자동 묶기 없음).
 * 오래된 해부터 차례로 — 해마다 다시 만난 관계가 위에서 아래로 이어진다.
 */
export function TogetherTimeline({ me, other, items, backHref }: { me: Person; other: Person; items: FeedItem[]; backHref: string }) {
  const byYear = [...Map.groupBy(items, (item) => item.shotYear)].toSorted(([a], [b]) => a - b);

  return (
    <section aria-labelledby="together-heading" className="flex flex-col gap-6 pt-5 pb-8">
      <header className="flex flex-col gap-1.5 border-b border-line px-4 pb-5 md:px-6">
        <h2 id="together-heading" className="text-lg font-bold">
          {me.displayName} <span className="text-sun">×</span>{" "}
          <Link prefetch={false} href={profileHref(other.handle)} className="underline-offset-2 hover:underline">
            {other.displayName}
          </Link>
        </h2>
        <p className="text-sm text-quiet">
          함께한 <strong className="text-text tabular-nums">{byYear.length}</strong>년 · 촬영{" "}
          <strong className="text-text tabular-nums">{items.length}</strong>번 · 두 사람의 이름이 크레딧으로 함께 오른 사진만
        </p>
        <Link href={backHref} className="inline-flex min-h-10 items-center self-start text-sm text-quiet hover:text-text">
          ← @{me.handle}의 작업물로
        </Link>
      </header>

      {byYear.length === 0 ? (
        <PhotoFeed items={[]} empty="함께 이름이 오른 사진이 아직 없어요." />
      ) : (
        <ol className="flex flex-col gap-8">
          {byYear.map(([year, list]) => (
            <li key={year} className="flex flex-col gap-3">
              <h3 className="flex items-baseline gap-3 px-4 md:px-6">
                <span className={`${pen.className} text-4xl leading-none`}>{year}</span>
                <span className="text-xs text-quiet tabular-nums">촬영 {list.length}번</span>
              </h3>
              <PhotoFeed items={list} empty="" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
