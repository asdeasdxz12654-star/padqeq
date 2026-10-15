"use client";

import { useState, useTransition } from "react";
import { setMemoryAlerts } from "./preferences";

export function MemoryAlertToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          startTransition(async () => {
            const result = await setMemoryAlerts(next);
            if (!result.ok) {
              setOn(!next);
              setError(result.error);
            }
          });
        }}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span>
        &lsquo;N년 전 오늘&rsquo; 알림
        <span className="block text-xs text-quiet">예전 오늘 찍은 내 사진 · 크레딧된 사진이 있으면 하루 한 번 알려 드려요.</span>
        {error && <span className="block text-xs text-red-300">{error}</span>}
      </span>
    </label>
  );
}
