"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hidePost } from "./actions";

export function HidePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("이 게시물을 숨길까요? 다른 사람에게 더 이상 보이지 않아요.")) return;
          setError(null);
          startTransition(async () => {
            const result = await hidePost(postId);
            if (!result.ok) {
              setError(result.error ?? "숨기지 못했어요.");
              return;
            }
            router.refresh();
          });
        }}
        className="self-start rounded-full border border-line px-3 py-1.5 text-sm text-quiet hover:text-text disabled:opacity-50"
      >
        {pending ? "숨기는 중…" : "게시 중단 (숨기기)"}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
