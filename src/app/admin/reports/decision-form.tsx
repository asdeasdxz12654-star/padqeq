"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MODERATION_DECISIONS, type ModerationDecision } from "@/lib/moderation/reasons";
import { moderate } from "./actions";

export function DecisionForm({ postId, held }: { postId: string; held: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = useState<ModerationDecision | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const options = (Object.keys(MODERATION_DECISIONS) as ModerationDecision[]).filter((d) => d !== "release" || held);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!decision) return;
        setError(null);
        startTransition(async () => {
          const result = await moderate({ postId, decision, note });
          if (!result.ok) {
            setError(result.error ?? "처리하지 못했어요.");
            return;
          }
          setDecision(null);
          setNote("");
          router.push("/admin/reports");
          router.refresh();
        });
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold">조치</legend>
        {options.map((d) => (
          <label key={d} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-checked:border-accent">
            <input
              type="radio"
              name="decision"
              checked={decision === d}
              onChange={() => setDecision(d)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className="text-sm">
              <span className="font-semibold">{MODERATION_DECISIONS[d].label}</span>
              <span className="block text-xs text-quiet">{MODERATION_DECISIONS[d].help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm">
        처리 사유 <span className="text-xs text-quiet">(필수 · 내부 기록, 감사 로그에 남아요)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          required
          className="rounded-xl border border-line bg-bg px-3 py-2 text-base"
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={!decision || !note.trim() || pending}
        className="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "처리 중…" : "처리 완료"}
      </button>
    </form>
  );
}
