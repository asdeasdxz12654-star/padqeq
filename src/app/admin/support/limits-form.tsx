"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LIMIT_INFO } from "@/lib/admin/limits";
import { setLimit } from "./limit-actions";

type Limit = { key: string; value: number; min_value: number; max_value: number };

/** 한도 값 (A-05 ③): 항목마다 새 값 + 바꾸는 이유 */
export function LimitsForm({ limits }: { limits: Limit[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {limits.map((l) => (
        <LimitRow key={`${l.key}-${l.value}`} limit={l} />
      ))}
    </ul>
  );
}

function LimitRow({ limit }: { limit: Limit }) {
  const router = useRouter();
  const [value, setValue] = useState(String(limit.value));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const info = LIMIT_INFO[limit.key];
  if (!info) return null;
  const changed = Number(value) !== limit.value;

  return (
    <li className="rounded-xl border border-line p-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await setLimit({ key: limit.key, value: Number(value), note });
            if (!result.ok) {
              setError(result.error ?? "바꾸지 못했어요.");
              return;
            }
            router.refresh();
          });
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`limit-${limit.key}`} className="min-w-0 flex-1 text-sm font-semibold">
            {info.label}
            <span className="block text-xs font-normal text-quiet">
              {info.help} · 범위 {limit.min_value}–{limit.max_value}
            </span>
          </label>
          <span className="flex items-center gap-1 text-sm">
            <input
              id={`limit-${limit.key}`}
              type="number"
              inputMode="numeric"
              min={limit.min_value}
              max={limit.max_value}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-h-11 w-24 rounded-xl border border-line bg-bg px-3 text-right text-base tabular-nums"
            />
            {info.unit}
          </span>
        </div>
        {changed && (
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`limit-note-${limit.key}`}>
              바꾸는 이유
            </label>
            <input
              id={`limit-note-${limit.key}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="바꾸는 이유 (감사 로그에 남아요)"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
            />
            <button
              type="submit"
              disabled={pending || !note.trim()}
              className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </form>
    </li>
  );
}
