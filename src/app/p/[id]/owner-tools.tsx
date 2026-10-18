"use client";

import { useState, useTransition } from "react";
import { setDailyPick, setProfileFeature } from "./actions";

const button = "min-h-9 rounded-full border border-line px-3 text-xs hover:border-quiet disabled:opacity-50";

/** 작성자: 이 글을 프로필 커버 · 고정으로 (S-09 ① ⑥) */
export function ProfileFeatureButtons({ postId, isCover, isPinned }: { postId: string; isCover: boolean; isPinned: boolean }) {
  const [cover, setCover] = useState(isCover);
  const [pinned, setPinned] = useState(isPinned);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = (kind: "cover" | "pin", on: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setProfileFeature(postId, kind, on);
      if (!result.ok) return setError(result.error);
      if (kind === "cover") setCover(on);
      else setPinned(on);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => toggle("cover", !cover)} className={button}>
        {cover ? "프로필 커버 해제" : "프로필 커버로"}
      </button>
      <button type="button" disabled={pending} onClick={() => toggle("pin", !pinned)} className={button}>
        {pinned ? "프로필 고정 해제" : "프로필에 고정"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/** 운영자: 오늘의 픽 넣기 · 빼기 (A-03 ⑥) */
export function PickButton({ postId, picked }: { postId: string; picked: boolean }) {
  const [on, setOn] = useState(picked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setDailyPick(postId, !on);
            if (!result.ok) return setError(result.error);
            setOn(!on);
          })
        }
        className={button}
      >
        {on ? "오늘의 픽에서 빼기" : "오늘의 픽에 넣기"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
