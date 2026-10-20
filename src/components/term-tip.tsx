"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// 회원 시안 46 ④: 처음 보는 말 옆 '?' → 한 줄 설명 (다른 곳을 누르거나 Esc면 닫힘)
const TERMS = {
  credit: "함께 찍은 사람(코스어 · 모델 · 촬영 · 보정)의 이름을 사진에 걸어요. 해담 회원이면 승인한 뒤 그분 프로필에도 보여요.",
  veil: "보기 불편할 수 있는 사진을 한 번 가려 두고, 누르면 보이게 해요. 설정에서 가리지 않고 바로 보기를 고를 수 있어요.",
  consent: "사진에 나온 분께 게시 동의를 받았다는 기록이에요. 운영자만 보고, 초상권 문의가 오면 확인해요.",
  shelf: "찍은 해마다 한 권씩 프로필에 꽂히는 책이에요. 누르면 그해 사진만 모아 봐요.",
  memory: "몇 년 전 같은 날 찍은 내 사진 · 크레딧된 사진을 다시 보여 드려요.",
  capsule: "사진에 미래의 나에게 쓰는 편지를 묻어 두면, 정한 날 아침에 열려요.",
  handle: "@로 시작하는 내 이름이에요. 크레딧의 기준이라 가입 뒤에는 바꿀 수 없어요.",
} as const;

export type Term = keyof typeof TERMS;

export function TermTip({ term, label }: { term: Term; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const id = useId();
  // 화면 오른쪽 끝에서 말풍선이 잘리지 않게 왼쪽으로 민다
  useLayoutEffect(() => {
    if (!open || !bubble.current || !box.current) return;
    const left = box.current.getBoundingClientRect().left;
    const width = bubble.current.offsetWidth;
    setShift(Math.min(0, window.innerWidth - 16 - (left + width)));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target instanceof Node && box.current?.contains(e.target))) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={box} className="relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label={`${label}란?`}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          // <label> 안에 있어도 입력 칸을 건드리지 않게
          e.preventDefault();
          setOpen(!open);
        }}
        className="inline-flex size-5 items-center justify-center rounded-full border border-line text-[11px] font-semibold text-quiet hover:border-quiet"
      >
        ?
      </button>
      <span
        ref={bubble}
        id={id}
        role="tooltip"
        style={{ left: shift }}
        hidden={!open}
        className="absolute top-full z-30 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-text px-3 py-2 text-xs font-normal leading-relaxed text-bg shadow-lg"
      >
        {TERMS[term]}
      </span>
    </span>
  );
}
