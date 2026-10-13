"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CREDIT_ROLE_LABEL, type CreditRole } from "@/lib/photos/credit-input";
import { profileHref } from "@/lib/profiles/profile-href";
import { resolveClaim } from "./actions";

export type CreditClaim = {
  id: string;
  note: string;
  claimant: string;
  label: string;
  role: CreditRole;
  postId: string;
  postTitle: string;
};

// 내 글의 미가입 크레딧에 온 연결 요청. 승인하면 그 회원 크레딧(승인됨)으로 바뀐다.
export function CreditClaims({ claims }: { claims: CreditClaim[] }) {
  const [handled, setHandled] = useState<Record<string, "approved" | "rejected">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="credit-claims" className="mt-10">
      <h2 id="credit-claims" className="mb-1 text-lg font-semibold">
        크레딧 연결 요청
      </h2>
      <p className="mb-3 text-xs text-quiet">미가입자로 적어 둔 크레딧이 자기라고 요청한 회원이에요. 같은 사람이 맞는지 확인하고 승인해 주세요.</p>
      <ul className="flex flex-col gap-2">
        {claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line p-3 text-sm">
            <span className="min-w-0 flex-1">
              <Link href={`/p/${c.postId}`} className="font-medium hover:underline">
                {c.postTitle}
              </Link>
              <span className="block text-xs text-quiet">
                &lsquo;{c.label}&rsquo;({CREDIT_ROLE_LABEL[c.role]}) →{" "}
                <Link href={profileHref(c.claimant)} className="text-text hover:underline">
                  @{c.claimant}
                </Link>
              </span>
              {c.note && <span className="mt-1 block text-xs">&ldquo;{c.note}&rdquo;</span>}
            </span>
            {handled[c.id] ? (
              <span className="text-xs text-quiet">{handled[c.id] === "approved" ? "연결했어요" : "거절했어요"}</span>
            ) : (
              <span className="flex gap-2">
                {(["approved", "rejected"] as const).map((decision) => (
                  <button
                    key={decision}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const result = await resolveClaim({ claimId: c.id, accept: decision === "approved" });
                        if (result.ok) setHandled((h) => ({ ...h, [c.id]: decision }));
                        else setError(result.error ?? "처리하지 못했어요.");
                      });
                    }}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${
                      decision === "approved" ? "bg-accent text-on-accent" : "border border-line"
                    }`}
                  >
                    {decision === "approved" ? "승인" : "거절"}
                  </button>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
