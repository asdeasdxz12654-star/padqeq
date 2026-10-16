"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { VEIL_LABEL, VEIL_REASONS, type VeilReason } from "@/lib/posts/veil";
import { setPostVeil } from "../actions";

/** 가림 표시 붙이기 · 바꾸기 · 풀기 (운영자). 붙이면 업로더에게 알리고, 업로더는 풀 수 없다. */
export function VeilForm({ postId, current, byStaff }: { postId: string; current: VeilReason | null; byStaff: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState(current);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = reason !== current || (reason !== null && !byStaff);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setPostVeil({ postId, reason, note });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setNote("");
          router.refresh();
        });
      }}
    >
      <p className="text-sm text-quiet">
        {current ? `지금: ${VEIL_LABEL[current].title} (${byStaff ? "운영자가 붙임 · 업로더가 풀 수 없음" : "업로더가 붙임"})` : "지금: 가리지 않음"}
      </p>
      <label className="flex flex-col gap-1.5 text-sm">
        가림 표시
        <select
          value={reason ?? ""}
          onChange={(e) => setReason((e.target.value || null) as VeilReason | null)}
          className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base"
        >
          <option value="">가리지 않음</option>
          {VEIL_REASONS.map((r) => (
            <option key={r} value={r}>
              {VEIL_LABEL[r].title} — {VEIL_LABEL[r].help}
            </option>
          ))}
        </select>
      </label>
      {changed && (
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="veil-note">
            이유
          </label>
          <input
            id="veil-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="이유 (감사 로그에 남아요)"
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
  );
}
