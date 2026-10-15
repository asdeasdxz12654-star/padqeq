"use client";

import { useState, useTransition } from "react";
import { revealEmail } from "../actions";

/** 가린 이메일 + 원문 보기 (사유 입력, 감사 로그에 남는다) */
export function RevealEmail({ memberId, masked }: { memberId: string; masked: string | null }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (email) return <span className="break-all">{email}</span>;
  return (
    <span className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <span className="break-all">{masked ?? "-"}</span>
        {masked && !open && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-quiet underline underline-offset-2">
            원문 보기
          </button>
        )}
      </span>
      {open && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await revealEmail(memberId, reason);
              if (result.ok) setEmail(result.email);
              else setError(result.error);
            });
          }}
        >
          <label className="sr-only" htmlFor="reveal-reason">
            열람 사유
          </label>
          <input
            id="reveal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="열람 사유 (감사 로그에 남아요)"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
          />
          <button type="submit" disabled={pending || reason.trim().length < 2} className="min-h-11 rounded-xl border border-line px-4 text-sm disabled:opacity-50">
            {pending ? "확인 중…" : "열람"}
          </button>
          {error && <span role="alert" className="text-sm text-red-300">{error}</span>}
        </form>
      )}
    </span>
  );
}
