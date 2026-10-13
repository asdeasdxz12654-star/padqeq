"use client";

import { useState } from "react";
import { ProtectedPhoto } from "@/components/protected-photo";
import type { PhotoSources } from "@/lib/photos/server";

// 민감 사유 신고 대상은 기본으로 흐리게 보여 주고, 누르면 해제한다 (A-04 ③)
export function BlurredPreview({ sources, width, height }: { sources: PhotoSources; width: number; height: number }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-xl bg-slot">
      <div className={revealed ? "" : "blur-2xl"}>
        <ProtectedPhoto sources={sources} alt="" width={width} height={height} sizes="400px" className="block h-auto w-full" />
      </div>
      {!revealed && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex items-center justify-center text-sm font-semibold"
        >
          눌러서 보기
        </button>
      )}
    </div>
  );
}
