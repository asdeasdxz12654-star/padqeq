import { Nanum_Pen_Script } from "next/font/google";
import Link from "next/link";
import type { FeedItem } from "@/lib/posts/feed";
import { ProtectedPhoto } from "./protected-photo";

// 연도 손글씨 (책장에서만 받는다)
const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });

/** count는 그해 사진 장수. 행사 · 함께한 사람은 표지에만 쓴다 (author_year_counts) */
export type ShelfYear = { year: number; count: number; events: number; partners: number; cover: FeedItem | null };

// 책등 색은 그해 표지 사진의 대표 색(photos.color)을 쓴다. 아직 색을 못 구한 해만 차분한 색을 차례로.
const SPINES = ["#d9d4ca", "#c9d3dc", "#d3dccb", "#e2d3cf", "#d8d0e0", "#e4dccb"];

/** 책등 글자색: 배경이 어두우면 흰 글자 (대비 확보) */
function inkOn(hex: string): string {
  const v = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  // 상대 휘도 (WCAG). 0.42를 넘으면 밝은 색으로 보고 먹색 글자를 쓴다.
  return 0.2126 * v(0) + 0.7152 * v(1) + 0.0722 * v(2) > 0.42 ? "#111111" : "#ffffff";
}

/** 그해 책등 색: 표지 사진의 대표 색 → 없으면 차분한 기본 색 */
function spineColor(year: ShelfYear, index: number): string {
  const color = year.cover?.cover?.color;
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : SPINES[index % SPINES.length]!;
}

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
          aria-label={`${latest!.year}년 · 사진 ${latest!.count}장${latest!.events > 0 ? ` · 행사 ${latest!.events}개` : ""}${latest!.partners > 0 ? ` · 함께한 사람 ${latest!.partners}명` : ""}`}
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
          {/* 표지에만 그해를 요약한다 (시안 23: 사진 184 · 행사 6 · 함께한 사람 9) */}
          <span className="text-xs text-quiet">
            {[`사진 ${latest!.count}`, latest!.events > 0 && `행사 ${latest!.events}`, latest!.partners > 0 && `함께한 사람 ${latest!.partners}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </Link>
        {rest.map((y, i) => (
          <Link
            key={y.year}
            prefetch={false}
            href={hrefFor(selected === y.year ? null : y.year)}
            aria-current={selected === y.year ? "page" : undefined}
            aria-label={`${y.year}년 · 사진 ${y.count}장`}
            style={{
              background: spineColor(y, i),
              color: inkOn(spineColor(y, i)),
              width: `${Math.min(64, 40 + Math.round(Math.sqrt(y.count) * 4))}px`,
            }}
            className="flex h-56 shrink-0 flex-col items-center justify-between border border-black/10 py-3 aria-[current=page]:outline-2 aria-[current=page]:outline-accent md:h-64"
          >
            <span className={`${pen.className} text-3xl leading-none [writing-mode:vertical-rl]`}>{y.year}</span>
            <span className="text-[11px] [writing-mode:vertical-rl]">{y.count}장</span>
            {/* 해담의 해. 책등이 붉은 해에도 묻히지 않게 글자색으로 테두리를 두른다 */}
            <span aria-hidden="true" className="size-2.5 rounded-full bg-sun outline outline-1 outline-current" />
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
