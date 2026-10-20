"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setExhibition } from "./exhibit-actions";

/** 운영 메뉴: 이 컬렉션을 홈 '전시'로 걸기 · 내리기 */
export function ExhibitForm({ id, exhibited, note: initial }: { id: string; exhibited: boolean; note: string }) {
  const router = useRouter();
  const [note, setNote] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (on: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setExhibition({ id, on, note });
      if (result.ok) router.refresh();
      else setError(result.error);
    });

  return (
    <details className="mt-2 max-w-xl rounded-xl border border-line p-4" open={exhibited || undefined}>
      <summary className="cursor-pointer text-sm font-semibold">운영 메뉴 · 홈 전시 {exhibited && <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">전시 중</span>}</summary>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-1 text-xs text-quiet">
          홈에 보일 소개 한 줄 (비우면 컬렉션 설명)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base text-text" />
        </label>
        {error && (
          <p role="alert" className="text-xs text-accent">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" disabled={pending} onClick={() => run(true)} className="min-h-10 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">
            {exhibited ? "소개 수정" : "전시로 걸기"}
          </button>
          {exhibited && (
            <button type="button" disabled={pending} onClick={() => run(false)} className="min-h-10 rounded-xl border border-line px-4 disabled:opacity-50">
              전시 내리기
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
