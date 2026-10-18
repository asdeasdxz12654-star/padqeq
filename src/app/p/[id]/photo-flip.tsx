"use client";

import { Nanum_Pen_Script } from "next/font/google";
import { useState } from "react";

// 뒷면 손글씨 (이 화면에서만 받는다)
const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });

export type PhotoBack = {
  date: string;
  places: string[];
  memo: string;
  /** 사진마다 남긴 뒷면 메모 (n번째 사진) */
  photoMemos: { n: number; memo: string }[];
  people: { role: string; name: string }[];
  exif: string | null;
};

/**
 * 사진 뒷면: 인화 사진을 뒤집어 보듯, 그날의 날짜 · 장소 · 메모 · 함께 만든 사람 (해담 로고의 '인화 사진 + 날짜 메모'와 같은 이야기).
 * 앞면(사진 뷰어)은 그대로 두고 위에 뒷면 종이를 덮는다.
 */
export function PhotoFlip({ back, children }: { back: PhotoBack; children: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="relative">
      <div aria-hidden={flipped} className={flipped ? "invisible" : undefined}>
        {children}
      </div>
      {flipped && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            role="group"
            aria-label="사진 뒷면"
            className={`${pen.className} flex max-h-full w-full max-w-md rotate-1 flex-col gap-3 overflow-auto bg-[#f6f3ec] p-6 text-[#2a2a2a] shadow-2xl motion-safe:animate-[develop_0.4s_ease-out]`}
          >
            <p className="text-4xl leading-none">{back.date}</p>
            {back.places.length > 0 && <p className="text-2xl leading-tight">{back.places.join(" · ")}</p>}
            <span className="h-px bg-[#d8d2c6]" />
            {back.memo && <p className="text-2xl leading-snug whitespace-pre-line">{back.memo}</p>}
            {back.photoMemos.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-2xl leading-snug">
                {back.photoMemos.map((m) => (
                  <li key={m.n} className="whitespace-pre-line">
                    {back.photoMemos.length > 1 || m.n > 1 ? <span className="mr-1.5 text-[#c54a40]">{m.n}.</span> : null}
                    {m.memo}
                  </li>
                ))}
              </ul>
            )}
            {back.people.length > 0 && (
              <p className="text-2xl leading-snug">
                {back.people.map((p) => `${p.role} ${p.name}`).join(" · ")}
              </p>
            )}
            {back.exif && <p className="font-mono text-xs text-[#6b6b66]">{back.exif}</p>}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-pressed={flipped}
        className="absolute top-2 right-2 z-10 flex min-h-10 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-bold text-white"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5" />
        </svg>
        {flipped ? "앞면 보기" : "뒷면 보기"}
      </button>
    </div>
  );
}
