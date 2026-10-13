"use client";

import { useState, useTransition } from "react";
import { type FollowTarget, setFollow } from "@/lib/follows/actions";

/** 태그 · 회원 팔로우 버튼. 누르는 즉시 바뀌고, 실패하면 되돌린다. */
export function FollowButton({ target, initial }: { target: FollowTarget; initial: boolean }) {
  const [following, setFollowing] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        aria-pressed={following}
        disabled={pending}
        onClick={() => {
          const next = !following;
          setFollowing(next);
          setError(null);
          startTransition(async () => {
            const result = await setFollow({ ...target, follow: next });
            if (!result.ok) {
              setFollowing(!next);
              setError(result.error ?? "처리하지 못했어요.");
            }
          });
        }}
        className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
          following ? "border border-line text-text" : "bg-accent text-on-accent"
        }`}
      >
        {following ? "팔로우 중" : "팔로우"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
