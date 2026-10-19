"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreMyPost } from "./actions";

/** 지운 글 되살리기 (지운 지 30일 안) — 상세 화면 · 내 글 관리에서 함께 쓴다 */
export function RestorePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await restoreMyPost(postId);
            if (!result.ok) {
              setError(result.error ?? "되살리지 못했어요.");
              return;
            }
            router.refresh();
          });
        }}
        className="min-h-10 self-start rounded-full bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "되살리는 중…" : "되살리기"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
