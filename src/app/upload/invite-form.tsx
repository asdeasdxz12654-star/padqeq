"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { redeemInvite } from "./invite-actions";

/** 초대 코드 입력 (초대 회원 단계) */
export function InviteForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-6 flex flex-col gap-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await redeemInvite(code);
          if (!result.ok) return setError(result.error);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        초대 코드
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          placeholder="예: ABCD-2345"
          className="min-h-12 rounded-xl border border-line bg-bg px-3 text-center font-mono text-xl tracking-widest"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={code.replace(/[^A-Z0-9]/g, "").length !== 8 || pending} className="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50">
        {pending ? "확인 중…" : "업로드 열기"}
      </button>
    </form>
  );
}
