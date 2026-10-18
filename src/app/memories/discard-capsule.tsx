"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { discardTimeCapsule } from "@/lib/capsules/actions";
import { confirmAction } from "@/lib/ui/confirm";

/** 아직 열리지 않은 타임캡슐 버리기 (읽지 않은 채 지워진다) */
export function DiscardCapsule({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirmAction({ title: "이 타임캡슐을 버릴까요?", body: "편지는 읽지 않은 채 지워지고, 되돌릴 수 없어요.", confirmLabel: "버리기", danger: true });
        if (!ok) return;
        startTransition(async () => {
          const result = await discardTimeCapsule(id);
          if (result.ok) router.refresh();
        });
      }}
      className="min-h-9 shrink-0 rounded-lg px-2 text-xs text-quiet hover:text-text disabled:opacity-50"
    >
      버리기
    </button>
  );
}
