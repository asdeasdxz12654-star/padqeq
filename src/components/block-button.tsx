"use client";

import { confirmAction } from "@/lib/ui/confirm";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setBlock } from "@/app/me/messages/actions";

/** 프로필에서 차단 · 풀기 (S-09 권한 · 안전). 차단하면 서로의 게시물 · 댓글 · 메시지가 보이지 않는다. */
export function BlockButton({ userId, handle, initial }: { userId: string; handle: string; initial: boolean }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          if (
            !blocked &&
            !(await confirmAction({
              title: `@${handle}님을 차단할까요?`,
              body: "서로의 게시물 · 댓글이 보이지 않고 메시지도 주고받을 수 없어요.",
              confirmLabel: "차단",
              danger: true,
            }))
          )
            return;
          startTransition(async () => {
            setError(null);
            const result = await setBlock(userId, !blocked);
            if (!result.ok) return setError(result.error);
            setBlocked(!blocked);
            router.refresh();
          });
        }}
        className="min-h-10 rounded-full border border-line px-4 text-sm text-quiet hover:border-quiet disabled:opacity-50"
      >
        {blocked ? "차단 풀기" : "차단"}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
