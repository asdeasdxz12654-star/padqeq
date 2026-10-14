"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moderateComment } from "./actions";

const DECISIONS = {
  dismiss: { label: "기각", help: "문제 없음. 자동으로 가려졌다면 다시 보이게 해요." },
  hide: { label: "가리기", help: "쓴 사람과 운영자만 보게 돼요. 쓴 사람에게 알림이 가요." },
} as const;
type Decision = keyof typeof DECISIONS;

/** 댓글 신고 처리 */
export function CommentDecisionForm({ commentId }: { commentId: string }) {
  const router = useRouter();
  const options: Decision[] = ["dismiss", "hide"];
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!decision) return;
        setError(null);
        startTransition(async () => {
          const result = await moderateComment({ commentId, decision, note });
          if (!result.ok) return setError(result.error ?? "처리하지 못했어요.");
          router.refresh();
        });
      }}
    >
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">조치</legend>
        {options.map((d) => (
          <label key={d} title={DECISIONS[d].help} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-accent">
            <input type="radio" name={`decision-${commentId}`} checked={decision === d} onChange={() => setDecision(d)} className="size-4 accent-[var(--accent)]" />
            {DECISIONS[d].label}
          </label>
        ))}
      </fieldset>
      {decision && <p className="text-xs text-quiet">{DECISIONS[decision].help}</p>}
      <label className="sr-only" htmlFor={`note-${commentId}`}>
        처리 사유
      </label>
      <input
        id={`note-${commentId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        required
        placeholder="처리 사유 (필수 · 내부 기록)"
        className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base"
      />
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button type="submit" disabled={!decision || !note.trim() || pending} className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
        {pending ? "처리 중…" : "처리 완료"}
      </button>
    </form>
  );
}
