"use client";

import Link from "next/link";
import { CREDIT_ROLE_LABEL, type CreditRole } from "@/lib/photos/credit-input";
import { profileHref } from "@/lib/profiles/profile-href";

export type CreditClaim = {
  id: string;
  note: string;
  claimant: string;
  label: string;
  role: CreditRole;
  postId: string;
  postTitle: string;
};

// 내 글의 미가입 크레딧에 온 연결 요청 (보기만). 남의 크레딧을 가로채지 못하게 운영자가 본인인지 확인하고 연결한다.
export function CreditClaims({ claims }: { claims: CreditClaim[] }) {

  return (
    <section aria-labelledby="credit-claims" className="mt-10">
      <h2 id="credit-claims" className="mb-1 text-lg font-semibold">
        크레딧 연결 요청
      </h2>
      <p className="mb-3 text-xs text-quiet">미가입자로 적어 둔 크레딧이 자기라고 요청한 회원이에요. 운영자가 본인인지 확인한 뒤 연결하고 알려 드려요. 다른 사람이라면 1:1 문의로 알려 주세요.</p>
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
            <span className="text-xs text-quiet">운영자 확인 중</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
