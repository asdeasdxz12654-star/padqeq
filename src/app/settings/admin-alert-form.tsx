"use client";

import { useState, useTransition } from "react";
import { type AdminAlertMode, setAdminAlerts } from "./preferences";

const OPTIONS: { value: AdminAlertMode; title: string; help: string }[] = [
  { value: "all", title: "긴급은 바로 + 하루 요약", help: "추천 · 요약은 오후 9시, 처리함에 남은 일이 있을 때만" },
  { value: "urgent", title: "긴급만", help: "긴급 신고 · 자동 숨김 · 소명만 바로" },
  { value: "off", title: "받지 않음", help: "처리함 화면에서만 봐요" },
];

/** 운영 알림 받는 방식 (운영진에게만 보인다) */
export function AdminAlertForm({ initial }: { initial: AdminAlertMode }) {
  const [mode, setMode] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <fieldset disabled={pending} className="flex flex-col gap-2">
      <legend className="sr-only">운영 알림 받는 방식</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-2 text-sm has-checked:border-accent">
          <input
            type="radio"
            name="admin-alerts"
            checked={mode === o.value}
            onChange={() => {
              setMode(o.value);
              startTransition(async () => {
                const result = await setAdminAlerts(o.value);
                setMessage(result.ok ? "저장했어요." : result.error);
              });
            }}
            className="size-5 accent-[var(--accent)]"
          />
          <span className="flex flex-col">
            <span className="font-semibold">{o.title}</span>
            <span className="text-xs text-quiet">{o.help}</span>
          </span>
        </label>
      ))}
      {message && (
        <p role="status" className="text-xs text-quiet">
          {message}
        </p>
      )}
    </fieldset>
  );
}
