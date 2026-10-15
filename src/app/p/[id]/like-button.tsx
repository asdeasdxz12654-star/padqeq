"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { isKey, shortcutAllowed } from "@/lib/keyboard";
import { DOUBLE_LIKE_EVENT } from "@/lib/posts/double-tap";
import { setLike } from "./actions";

/** 좋아요 (S-06 ②). 누르면 바로 바뀌고, 실패하면 되돌린다. 사진을 두 번 톡 해도 누른다 (취소는 안 함). */
export function LikeButton({ postId, initial, count, loginHref }: { postId: string; initial: boolean; count: number; loginHref: string | null }) {
  const [liked, setLiked] = useState(initial);
  const [likes, setLikes] = useState(count);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const likedRef = useRef(initial);
  const box = useRef<HTMLSpanElement>(null);

  const change = useCallback(
    (next: boolean) => {
      likedRef.current = next;
      setLiked(next);
      setLikes((n) => n + (next ? 1 : -1));
      setError(null);
      startTransition(async () => {
        const result = await setLike(postId, next);
        if (!result.ok) {
          likedRef.current = !next;
          setLiked(!next);
          setLikes((n) => n + (next ? -1 : 1));
          setError(result.error);
        }
      });
    },
    [postId],
  );

  useEffect(() => {
    if (loginHref) return;
    const onDouble = (e: Event) => {
      if ((e as CustomEvent<{ postId: string }>).detail?.postId === postId && !likedRef.current) change(true);
    };
    // 단축키 L (S-07 ⑦): 누르기 · 취소
    const onKey = (e: KeyboardEvent) => {
      if (shortcutAllowed(e, box.current) && isKey(e, "l", "ㅣ")) change(!likedRef.current);
    };
    window.addEventListener(DOUBLE_LIKE_EVENT, onDouble);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(DOUBLE_LIKE_EVENT, onDouble);
      window.removeEventListener("keydown", onKey);
    };
  }, [change, loginHref, postId]);

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
    <span ref={box} className="inline-flex flex-col">
      <button
        type="button"
        aria-pressed={liked}
        disabled={pending}
        onClick={() => change(!liked)}
        className={className}
      >
        {heart}
        좋아요{likes > 0 && <span className="tabular-nums"> {likes}</span>}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
