"use client";

import { useState, useTransition } from "react";
import { claimCredit } from "./actions";

/** 미가입자로 적힌 크레딧이 나라면 연결을 요청한다. 작성자가 승인하면 내 회원 크레딧이 된다. */
export function ClaimCreditButton({ creditId, label, requested }: { creditId: string; label: string; requested: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(requested);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) return <span className="text-xs text-quiet">연결 요청함</span>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-quiet underline underline-offset-2 hover:text-text">
        나예요
      </button>
    );
  }

  return (
    <form
      className="mt-1 flex w-full flex-col gap-2 rounded-lg border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await claimCredit({ creditId, note });
          if (!result.ok) {
            setError(result.error ?? "요청하지 못했어요.");
            return;
          }
          setDone(true);
        });
      }}
    >
      <p className="text-xs leading-relaxed text-quiet">
        &lsquo;{label}&rsquo;이(가) 나라면 내 계정으로 연결해 달라고 업로더에게 요청해요. 승인되면 내 프로필의 크레딧된 작업에 보여요.
      </p>
      <label className="flex flex-col gap-1 text-xs text-quiet">
        업로더에게 한마디 (선택)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="예) 그날 모델을 맡았던 ○○예요"
          className="min-h-10 rounded-lg border border-line bg-surface px-3 text-base text-text"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50">
          {pending ? "보내는 중…" : "연결 요청"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-lg border border-line px-4 text-sm">
          취소
        </button>
      </div>
    </form>
  );
}
