"use client";

import { Nanum_Pen_Script } from "next/font/google";
import { useState } from "react";
import type { FeedItem } from "@/lib/posts/feed";
import { ProtectedPhoto } from "./protected-photo";

const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });

/**
 * 같은 자리, 다른 해 (해담다움 · 시안 24): 같은 태그의 가장 오래된 해와 가장 최근 해를
 * 손잡이로 밀어 겹쳐 본다. 가림 표시가 붙은 사진은 눌러야 보이므로 비교에 쓰지 않는다.
 */
export function YearCompare({ older, newer }: { older: { year: number; item: FeedItem }; newer: { year: number; item: FeedItem } }) {
  const [pos, setPos] = useState(50);
  const label = (year: number) => (
    <span className={`${pen.className} rounded-lg bg-black/45 px-2 text-2xl leading-tight text-white`}>{year}</span>
  );
  const photo = (item: FeedItem) => (
    <ProtectedPhoto
      sources={item.cover!.sources}
      alt=""
      width={item.cover!.width}
      height={item.cover!.height}
      sizes="(min-width: 768px) 720px, 100vw"
      className="block size-full object-cover"
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slot select-none [&_picture]:h-full">
        {/* 최근 해가 아래, 오래된 해가 위에서 손잡이만큼 잘린다 */}
        <div className="absolute inset-0">{photo(newer.item)}</div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {photo(older.item)}
        </div>

        <span className="pointer-events-none absolute top-3 left-3">{label(older.year)}</span>
        <span className="pointer-events-none absolute top-3 right-3">{label(newer.year)}</span>

        {/* 가르는 선과 손잡이 */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `calc(${pos}% - 1px)` }} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-sm font-bold text-[#111111] shadow-lg"
          style={{ left: `${pos}%` }}
        >
          ‹ ›
        </span>

        {/* 조작은 range로 받는다: 끌기 · 키보드 · 보조기술이 모두 된다 */}
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`두 해 비교. 왼쪽 ${older.year}년, 오른쪽 ${newer.year}년`}
          className="absolute inset-0 size-full cursor-ew-resize appearance-none bg-transparent opacity-0"
        />
      </div>
      <p className="text-xs text-quiet">
        손잡이를 좌우로 밀면 {older.year}년과 {newer.year}년이 겹쳐 보여요.
      </p>
    </div>
  );
}
