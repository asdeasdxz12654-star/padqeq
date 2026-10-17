import { Nanum_Pen_Script } from "next/font/google";
import Link from "next/link";
import type { FeedItem } from "@/lib/posts/feed";
import { ProtectedPhoto } from "./protected-photo";
import { Veil } from "./veil";

const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });

export type YearCover = { year: number; cover: FeedItem | null };

/**
 * 같은 자리, 다른 해 (해담다움): 같은 장소 · 캐릭터 · 작품을 해마다 담은 사진을 나란히.
 * 해마다 한 장씩, 누르면 그해 사진만 본다. 해가 두 개 이상일 때만 보인다.
 */
export function YearsStrip({ title, sub, years, hrefFor }: { title: string; sub: string; years: YearCover[]; hrefFor(year: number): string }) {
  const withCover = years.filter((y) => y.cover?.cover);
  if (withCover.length < 2) return null;
  return (
    <section aria-labelledby="years-strip" className="px-4 pt-6 md:px-6">
      <h2 id="years-strip" className="text-lg font-bold">
        {title}
      </h2>
      <p className="mb-3 text-sm text-quiet">{sub}</p>
      <ol className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
        {withCover.map((y) => (
          <li key={y.year} className="w-36 shrink-0 md:w-44">
            <Link prefetch={false} href={hrefFor(y.year)} aria-label={`${y.year}년 사진 보기`} className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-slot [&_picture]:h-full">
              <Veil postId={y.cover!.id} reason={y.cover!.cover!.veil} fill>
                <ProtectedPhoto
                  sources={y.cover!.cover!.sources}
                  alt={y.cover!.cover!.alt}
                  width={y.cover!.cover!.width}
                  height={y.cover!.cover!.height}
                  sizes="176px"
                  className="block size-full object-cover"
                />
              </Veil>
              <span className={`${pen.className} absolute top-2 left-2 rounded-lg bg-black/45 px-2 text-2xl leading-tight text-white`}>{y.year}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
