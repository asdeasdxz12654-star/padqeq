"use client";

import { useState } from "react";

/** 신고 증거 사진. 성적 · 폭력적인 내용일 수 있어 흐리게 두고, 누르면 보인다. 새 탭에서 원래 크기로 연다. */
export function EvidenceImage({ id, index, kind = "reports" }: { id: string; index: number; kind?: "reports" | "appeals" }) {
  const [shown, setShown] = useState(false);
  const src = `/api/${kind}/evidence/${id}`;
  return (
    <figure className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setShown(true)}
        aria-label={shown ? `증거 ${index}` : `증거 ${index} 보기`}
        className="relative block aspect-square w-28 overflow-hidden rounded-lg bg-slot"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 운영자 전용 비공개 파일 (이미지 최적화 거치지 않음) */}
        <img src={src} alt="" loading="lazy" className={`size-full object-cover ${shown ? "" : "scale-110 blur-xl"}`} />
        {!shown && <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">눌러서 보기</span>}
      </button>
      {shown && (
        <a href={src} target="_blank" rel="noopener" className="text-xs text-quiet underline underline-offset-2">
          원래 크기
        </a>
      )}
    </figure>
  );
}
