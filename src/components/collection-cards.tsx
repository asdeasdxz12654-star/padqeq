import Link from "next/link";
import type { CollectionCard } from "@/lib/collections/load";
import { ProtectedPhoto } from "./protected-photo";

/** 컬렉션 카드 목록 (프로필 · 마이). 표지는 가장 최근에 담은 사진. */
export function CollectionCards({ items, empty }: { items: CollectionCard[]; empty: string }) {
  if (items.length === 0) return <p className="px-4 py-16 text-center text-sm text-quiet md:px-6">{empty}</p>;

  return (
    <ul className="grid grid-cols-2 gap-3 px-4 md:grid-cols-3 md:px-6 xl:grid-cols-5">
      {items.map((c) => (
        <li key={c.id}>
          <article className="relative">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-slot [&_picture]:h-full">
              {/* 가림 표시 표지는 흐리게만 (누르면 컬렉션으로) */}
              {c.cover && (
                <div className={`size-full ${c.cover.veil ? "blur-2xl brightness-75" : ""}`}>
                  <ProtectedPhoto
                    sources={c.cover.sources}
                    alt=""
                    width={c.cover.width}
                    height={c.cover.height}
                    sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw"
                    className="block size-full object-cover"
                  />
                </div>
              )}
              {c.cover?.veil && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">가림 표시</span>
              )}
            </div>
            <h3 className="truncate px-1 pt-2 text-sm font-medium">
              <Link href={`/c/${c.id}`} className="after:absolute after:inset-0">
                {c.title}
              </Link>
            </h3>
            <p className="px-1 text-xs text-quiet">
              {c.count}개{!c.isPublic && " · 나만 보기"}
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}
