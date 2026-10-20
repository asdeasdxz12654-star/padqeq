"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/photos/categories";

// 글쓰기 작성 목록 (캔버스 36–40): 사진 올리기(분류 5) · 커뮤니티 글(촬영 장소 · 자유 · Q&A) · 행사 알리기.
// 휴대폰은 [+] → 아래에서 올라오는 시트, PC는 헤더 [글쓰기 ▾] → 바로 아래 목록. 구인 · 섭외는 2026-10-20부터 뺐다.

const SWATCH: Record<(typeof CATEGORIES)[number], string> = {
  cosplay: "bg-[#C4A7A0]",
  model: "bg-[#B3A0B5]",
  landscape: "bg-[#97A89F]",
  travel: "bg-[#8E9FB0]",
  other: "bg-[#C8BBA2]",
};

const BOARDS = [
  { board: "places", title: "촬영 장소", help: "촬영하기 좋은 곳 · 허가 · 주의할 점" },
  { board: "free", title: "자유", help: "사진 · 코스프레 이야기" },
  { board: "qna", title: "Q&A", help: "보정 · 장비 · 촬영 질문" },
] as const;

/** 작성 목록 내용 (시트 · 드롭다운 공통). onPick: 항목을 고르면 닫기 */
export function WriteMenuList({ onPick }: { onPick(): void }) {
  const row = "flex min-h-12 items-center gap-3 px-3.5 text-left hover:bg-surface";
  return (
    <nav aria-label="글쓰기" className="flex flex-col gap-3">
      <p className="text-xs font-bold text-quiet">사진 올리기</p>
      <ul className="grid grid-cols-5 gap-1.5">
        {CATEGORIES.map((c) => (
          <li key={c}>
            <Link
              prefetch={false}
              href={`/upload?category=${c}`}
              onClick={onPick}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line px-0.5 py-2.5 text-center text-xs hover:border-quiet"
            >
              <span aria-hidden="true" className={`size-8 rounded-lg ${SWATCH[c]}`} />
              {CATEGORY_LABEL[c]}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs font-bold text-quiet">커뮤니티 글</p>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
        {BOARDS.map((b) => (
          <li key={b.board}>
            <Link prefetch={false} href={`/community/write?board=${b.board}`} onClick={onPick} className={row}>
              <span className="flex flex-col">
                <strong className="font-semibold">{b.title}</strong>
                <span className="text-xs text-quiet">{b.help}</span>
              </span>
              <span aria-hidden="true" className="ml-auto text-quiet">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link prefetch={false} href="/events/propose" onClick={onPick} className={`${row} rounded-xl border border-line text-sm`}>
        <span className="flex flex-col">
          <strong className="font-semibold">행사 알리기</strong>
          <span className="text-xs text-quiet">캘린더에 없는 행사 제안</span>
        </span>
        <span aria-hidden="true" className="ml-auto text-quiet">
          ›
        </span>
      </Link>
    </nav>
  );
}

/** PC 헤더 [글쓰기 ▾]: 바로 아래에 작성 목록. 바깥을 누르거나 Esc면 닫힌다. */
export function HeaderWriteButton() {
  const box = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (box.current) box.current.open = false;
  };
  useEffect(() => {
    const onDown = (e: Event) => {
      const d = box.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") d.open = false;
        return;
      }
      if (e.target instanceof Node && d.contains(e.target)) return;
      d.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onDown);
    };
  }, []);
  return (
    <details ref={box} className="relative hidden md:block">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full bg-accent px-4 font-bold text-on-accent [&::-webkit-details-marker]:hidden">
        글쓰기
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[22rem] rounded-2xl border border-line bg-bg p-3.5 shadow-xl">
        <WriteMenuList onPick={close} />
      </div>
    </details>
  );
}
