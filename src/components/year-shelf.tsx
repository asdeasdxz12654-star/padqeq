import { Nanum_Pen_Script } from "next/font/google";
import Link from "next/link";
import type { FeedItem } from "@/lib/posts/feed";
import { ProtectedPhoto } from "./protected-photo";

// 연도 손글씨 (책장에서만 받는다)
const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });

export type ShelfYear = { year: number; count: number; more: boolean; cover: FeedItem | null };

// 책등 색: 사진 대표 색을 아직 저장하지 않아서, 차분한 색을 차례로 (글자는 늘 먹색)
const SPINES = ["#d9d4ca", "#c9d3dc", "#d3dccb", "#e2d3cf", "#d8d0e0", "#e4dccb"];

/**
 * 연도 책장 (해담다움): 프로필에 해마다 한 권씩 책이 꽂힌다. 가장 최근 해는 표지가 보이게, 지난해는 책등으로.
 * 책을 누르면 그해 사진만 본다. '해마다 담다'가 화면으로 보이는 곳.
 */
export function YearShelf({ years, selected, hrefFor }: { years: ShelfYear[]; selected: number | null; hrefFor(year: number | null): string }) {
  if (years.length === 0) return null;
  const [latest, ...rest] = years;
  return (
    <section aria-label="연도 책장" className="px-4 pt-5 pb-4 md:px-6">
      <div className="flex items-end gap-2.5 overflow-x-auto border-b-[6px] border-line pb-0 [scrollbar-width:none]">
        <Link
          prefetch={false}
          href={hrefFor(selected === latest!.year ? null : latest!.year)}
          aria-current={selected === latest!.year ? "page" : undefined}
          aria-label={`${latest!.year}년 · 사진 ${latest!.count}${latest!.more ? "장 이상" : "장"}`}
          className="flex w-36 shrink-0 flex-col border border-line bg-bg p-2 pb-3 shadow-[3px_3px_0_var(--line)] aria-[current=page]:outline-2 aria-[current=page]:outline-accent md:w-44"
        >
          <span className="block aspect-[4/5] overflow-hidden bg-slot [&_picture]:h-full">
            {latest!.cover?.cover && !latest!.cover.cover.veil && (
              <ProtectedPhoto
                sources={latest!.cover.cover.sources}
                alt=""
                width={latest!.cover.cover.width}
                height={latest!.cover.cover.height}
                sizes="176px"
                className="block size-full object-cover"
              />
            )}
          </span>
          <span className={`${pen.className} mt-2 text-3xl leading-none`}>{latest!.year}</span>
          <span className="text-xs text-quiet">
            사진 {latest!.count}
            {latest!.more ? "+" : ""}
          </span>
        </Link>
        {rest.map((y, i) => (
          <Link
            key={y.year}
            prefetch={false}
            href={hrefFor(selected === y.year ? null : y.year)}
            aria-current={selected === y.year ? "page" : undefined}
            aria-label={`${y.year}년 · 사진 ${y.count}${y.more ? "장 이상" : "장"}`}
            style={{ background: SPINES[i % SPINES.length], width: `${Math.min(64, 40 + Math.round(Math.sqrt(y.count) * 4))}px` }}
            className="flex h-56 shrink-0 flex-col items-center justify-between border border-black/10 py-3 text-[#111111] aria-[current=page]:outline-2 aria-[current=page]:outline-accent md:h-64"
          >
            <span className={`${pen.className} text-3xl leading-none [writing-mode:vertical-rl]`}>{y.year}</span>
            <span className="text-[11px] [writing-mode:vertical-rl]">
              {y.count}
              {y.more ? "+" : ""}장
            </span>
            <span aria-hidden="true" className="size-2.5 rounded-full bg-sun" />
          </Link>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-quiet">
        해마다 한 권씩 쌓여요. 책을 누르면 그해 사진만 봐요.
        {selected !== null && (
          <Link prefetch={false} href={hrefFor(null)} className="font-bold text-text underline underline-offset-2">
            모든 해 보기
          </Link>
        )}
      </p>
    </section>
  );
}
