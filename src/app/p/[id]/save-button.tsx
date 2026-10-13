"use client";

import { useState, useTransition } from "react";
import { setBookmark } from "./actions";

/** 저장 (내 공간에 모아 두기). 누르는 즉시 바뀌고, 실패하면 되돌린다. */
export function SaveButton({ postId, initial }: { postId: string; initial: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        aria-pressed={saved}
        disabled={pending}
        onClick={() => {
          const next = !saved;
          setSaved(next);
          setError(null);
          startTransition(async () => {
            const result = await setBookmark(postId, next);
            if (!result.ok) {
              setSaved(!next);
              setError(result.error ?? "처리하지 못했어요.");
            }
          });
        }}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${
          saved ? "border border-line text-text" : "bg-accent text-on-accent"
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M6 3.5h12v17l-6-4.2-6 4.2z" />
        </svg>
        {saved ? "저장됨" : "저장"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
