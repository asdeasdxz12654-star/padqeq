"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { republishPost } from "./actions";

/** 내가 숨긴 글 다시 게시 */
export function RepublishButton({ postId }: { postId: string }) {
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
            const result = await republishPost(postId);
            if (!result.ok) {
              setError(result.error ?? "다시 게시하지 못했어요.");
              return;
            }
            router.refresh();
          });
        }}
        className="min-h-10 self-start rounded-full bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "게시하는 중…" : "다시 게시"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
