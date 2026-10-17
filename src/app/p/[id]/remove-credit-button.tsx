"use client";

import { confirmAction } from "@/lib/ui/confirm";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeMyCredit } from "./actions";

export function RemoveCreditButton({ creditId }: { creditId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmAction({ title: "이 게시물에서 내 크레딧을 해제할까요?", confirmLabel: "해제", danger: true }))) return;
        startTransition(async () => {
          const result = await removeMyCredit(creditId);
          if (result.ok) router.refresh();
          else window.alert(result.error);
        });
      }}
      className="text-xs text-quiet underline underline-offset-2 hover:text-text disabled:opacity-50"
    >
      내 크레딧 해제
    </button>
  );
}
