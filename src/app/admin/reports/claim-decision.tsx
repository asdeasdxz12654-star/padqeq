"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveClaim } from "./actions";

/** 크레딧 연결 요청 승인 · 거절 (운영자) */
export function ClaimDecision({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (accept: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await resolveClaim({ claimId, accept });
      if (!result.ok) return setError(result.error ?? "처리하지 못했어요.");
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => decide(true)} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50">
        본인 맞음 · 연결
      </button>
      <button type="button" disabled={pending} onClick={() => decide(false)} className="min-h-10 rounded-xl border border-line px-4 text-sm disabled:opacity-50">
        거절
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
