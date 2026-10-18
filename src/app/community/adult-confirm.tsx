"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAdult } from "./actions";

/** 만 19세 이상 확인 (섭외 글쓰기 · 지원 · 섭외 가능 표시 전에 한 번). 생년월일은 저장하지 않는다. */
export function AdultConfirm({ reason }: { reason: string }) {
  const router = useRouter();
  const [birthDate, setBirthDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await confirmAdult(birthDate);
          if (!result.ok) return setMessage(result.error);
          if (!result.adult) return setMessage("만 19세 이상부터 쓸 수 있어요. 다른 게시판은 그대로 이용할 수 있어요.");
          router.refresh();
        });
      }}
    >
      <p className="text-sm font-semibold">만 19세 이상 확인이 필요해요</p>
      <p className="text-xs leading-relaxed text-quiet">{reason} 생년월일은 나이 확인에만 쓰고 저장하지 않아요. 한 번 확인하면 다시 묻지 않아요.</p>
      <label className="flex flex-col gap-1.5 text-sm">
        생년월일
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base" />
      </label>
      {message && (
        <p role="alert" className="text-sm text-warn">
          {message}
        </p>
      )}
      <button type="submit" disabled={!birthDate || pending} className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
        확인
      </button>
    </form>
  );
}
