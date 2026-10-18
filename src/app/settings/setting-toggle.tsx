"use client";

import { useState, useTransition } from "react";
import { setCreditAutoApprove, setMemoryAlerts, setShowVeiled } from "./preferences";

const ACTIONS = { memory: setMemoryAlerts, creditAuto: setCreditAutoApprove, showVeiled: setShowVeiled };

/** 켜기 · 끄기 설정 하나 (바로 저장, 실패하면 되돌린다) */
export function SettingToggle({ kind, initial, title, help }: { kind: keyof typeof ACTIONS; initial: boolean; title: string; help: string }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          setError(null);
          startTransition(async () => {
            const result = await ACTIONS[kind](next);
            if (!result.ok) {
              setOn(!next);
              setError(result.error);
            }
          });
        }}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span>
        {title}
        <span className="block text-xs text-quiet">{help}</span>
        {error && <span className="block text-xs text-danger">{error}</span>}
      </span>
    </label>
  );
}
