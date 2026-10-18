"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CREDIT_ROLE_LABEL, type CreditRole } from "@/lib/photos/credit-input";
import { respondCredit } from "./actions";

export type CreditRequest = { id: string; role: CreditRole; postId: string; postTitle: string; uploader: string };

// 나를 태그한 크레딧 요청 (S-09 크레딧된 작업 · S-14 ③). 승인하면 내 프로필 "크레딧된 작업"에 보인다.
export function CreditRequests({ requests }: { requests: CreditRequest[] }) {
  const [handled, setHandled] = useState<Record<string, "approved" | "rejected">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="credit-requests" className="mt-10">
      <h2 id="credit-requests" className="mb-3 text-lg font-semibold">
        나를 태그한 크레딧 요청
      </h2>
      <ul className="flex flex-col gap-2">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line p-3 text-sm">
            <span className="min-w-0 flex-1">
              <Link href={`/p/${r.postId}`} className="font-medium hover:underline">
                {r.postTitle}
              </Link>
              <span className="block text-xs text-quiet">
                @{r.uploader}님이 나를 &lsquo;{CREDIT_ROLE_LABEL[r.role]}&rsquo;(으)로 태그했어요
              </span>
            </span>
            {handled[r.id] ? (
              <span className="text-xs text-quiet">{handled[r.id] === "approved" ? "승인했어요" : "거절했어요"}</span>
            ) : (
              <span className="flex gap-2">
                {(["approved", "rejected"] as const).map((decision) => (
                  <button
                    key={decision}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        const result = await respondCredit({ creditId: r.id, decision });
                        if (result.ok) setHandled((h) => ({ ...h, [r.id]: decision }));
                        else setError(result.error ?? "처리하지 못했어요.");
                      })
                    }
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
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
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
