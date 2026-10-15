"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SANCTION_LABEL, SUSPEND_DAYS, type SanctionAction, daysLabel } from "@/lib/moderation/sanctions";
import { sanction } from "../actions";

/** 회원 제재 폼. options는 지금 상태에서 고를 수 있는 조치. */
export function SanctionForm({ memberId, options }: { memberId: string; options: SanctionAction[] }) {
  const router = useRouter();
  const [action, setAction] = useState<SanctionAction | null>(null);
  const [days, setDays] = useState<number>(7);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const suspend = action === "suspend";
  const needsReason = suspend || action === "warn";

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!action) return;
        setError(null);
        setDone(null);
        startTransition(async () => {
          const result = await sanction({
            memberId,
            action,
            note,
            days: suspend ? days : null,
            reason: needsReason ? reason : null,
          });
          if (!result.ok) {
            setError(result.error ?? "처리하지 못했어요.");
            return;
          }
          setDone(`${SANCTION_LABEL[action].label} 처리했어요. 회원에게 알림이 갔어요.`);
          setAction(null);
          setReason("");
          setNote("");
          router.refresh();
        });
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold">조치</legend>
        {options.map((a) => (
          <label key={a} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-checked:border-accent">
            <input
              type="radio"
              name="action"
              checked={action === a}
              onChange={() => setAction(a)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className="text-sm">
              <span className="font-semibold">{SANCTION_LABEL[a].label}</span>
              <span className="block text-xs text-quiet">{SANCTION_LABEL[a].help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {suspend && (
          <fieldset>
            <legend className="mb-1.5 text-sm">기간</legend>
            <div className="flex flex-wrap gap-2">
              {SUSPEND_DAYS.map((d) => (
                <label
                  key={d}
                  className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-text has-checked:bg-text has-checked:text-bg"
                >
                  <input type="radio" name="days" checked={days === d} onChange={() => setDays(d)} className="sr-only" />
                  {daysLabel(d)}
                </label>
              ))}
            </div>
          </fieldset>
      )}
      {needsReason && (
          <label className="flex flex-col gap-1.5 text-sm">
            회원에게 보여 줄 사유 <span className="text-xs text-quiet">(필수 · 본인에게만 보여요)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              required
              placeholder="예: 촬영 동의 없는 사진을 반복해 올림"
              className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base"
            />
          </label>
      )}

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
      {done && <p role="status" className="text-sm text-quiet">{done}</p>}
      <button
        type="submit"
        disabled={!action || !note.trim() || (needsReason && !reason.trim()) || pending}
        className="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "처리 중…" : "처리 완료"}
      </button>
    </form>
  );
}
