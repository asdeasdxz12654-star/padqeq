import Link from "next/link";
import type { OnThisDayItem } from "@/lib/posts/on-this-day";
import { ProtectedPhoto } from "./protected-photo";
import { Veil } from "./veil";

/** 홈 상단 "N년 전 이맘때" (가로로 넘겨 보기). 사진이 없으면 아무것도 그리지 않는다. */
export function OnThisDay({ items }: { items: OnThisDayItem[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="on-this-day" className="px-4 pt-2 pb-4 md:px-6">
      <h2 id="on-this-day" className="mb-2 flex items-center justify-between text-base font-semibold">
        이맘때의 사진
        <Link prefetch={false} href="/memories" className="text-xs font-normal text-quiet hover:underline">
          모두 보기 ›
        </Link>
      </h2>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6">
        {items.map((post) => (
          <li key={post.id} className="w-36 shrink-0 snap-start md:w-44">
            <article className="relative">
              <div className="aspect-[4/5] overflow-hidden rounded-lg bg-slot [&_picture]:h-full">
                {post.cover && (
                  <Veil postId={post.id} reason={post.cover.veil} fill>
                    <ProtectedPhoto
                      sources={post.cover.sources}
                      alt={post.cover.alt}
                      width={post.cover.width}
                      height={post.cover.height}
                      sizes="176px"
                      className="block size-full object-cover"
                    />
                  </Veil>
                )}
              </div>
              <span className="absolute top-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                {post.yearsAgo}년 전
              </span>
              <h3 className="truncate px-1 pt-1.5 text-xs">
                <Link prefetch={false} href={`/p/${post.id}`} className="after:absolute after:inset-0">
                  {post.title}
                </Link>
              </h3>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
