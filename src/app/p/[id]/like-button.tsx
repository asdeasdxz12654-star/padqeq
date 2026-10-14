"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setLike } from "./actions";

/** 좋아요 (S-06 ②). 누르면 바로 바뀌고, 실패하면 되돌린다. */
export function LikeButton({ postId, initial, count, loginHref }: { postId: string; initial: boolean; count: number; loginHref: string | null }) {
  const [liked, setLiked] = useState(initial);
  const [likes, setLikes] = useState(count);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const heart = (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  );
  const className = `inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm ${
    liked ? "border-accent text-accent" : "border-line hover:border-quiet"
  }`;

  if (loginHref) {
    return (
      <Link href={loginHref} className={className}>
        {heart}
        좋아요{likes > 0 && <span className="tabular-nums"> {likes}</span>}
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        aria-pressed={liked}
        disabled={pending}
        onClick={() => {
          const next = !liked;
          setLiked(next);
          setLikes((n) => n + (next ? 1 : -1));
          setError(null);
          startTransition(async () => {
            const result = await setLike(postId, next);
            if (!result.ok) {
              setLiked(!next);
              setLikes((n) => n + (next ? -1 : 1));
              setError(result.error);
            }
          });
        }}
        className={className}
      >
        {heart}
        좋아요{likes > 0 && <span className="tabular-nums"> {likes}</span>}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
