"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { VEIL_LABEL, type VeilReason } from "@/lib/posts/veil-reasons";

// 가림 표시 (S-08 ⑩): 흐리게 가리고, 눌러야 보인다. 한 번 연 글은 이 탭에서 다시 가리지 않는다 (카드 → 상세).
const KEY = "haedam:unveiled";
const listeners = new Set<() => void>();

function readOpened(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
function open(postId: string) {
  try {
    const ids = readOpened().split(",").filter(Boolean);
    // 탭마다 최근 200개까지만
    sessionStorage.setItem(KEY, [...new Set([postId, ...ids])].slice(0, 200).join(","));
  } catch {
    // 저장할 수 없으면 이 화면에서만 연다
  }
  opened.add(postId);
  listeners.forEach((l) => l());
}
// 저장소를 못 쓰는 브라우저에서도 이 화면 안에서는 열린 채로
const opened = new Set<string>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function Veil({
  postId,
  reason,
  variant = "card",
  fill = false,
  children,
}: {
  postId: string;
  reason: VeilReason | null;
  /** card: 피드 타일 (작게) · full: 상세 사진 뷰어 */
  variant?: "card" | "full";
  /** 부모 높이를 채운다 (정사각 · 4:5 타일) */
  fill?: boolean;
  children: ReactNode;
}) {
  const revealed = useSyncExternalStore(
    subscribe,
    () => !reason || opened.has(postId) || readOpened().split(",").includes(postId),
    () => !reason,
  );
  if (revealed) return <>{children}</>;

  const label = VEIL_LABEL[reason!].title;
  return (
    <div className={`relative z-10 min-w-0 overflow-hidden ${fill ? "size-full" : ""}`}>
      {/* 카드 전체 링크(after:inset-0)보다 위에 둔다. 가린 동안에는 누르거나 초점이 가지 않게 (inert) */}
      <div inert className={`pointer-events-none blur-2xl brightness-75 select-none ${fill ? "size-full" : ""}`} aria-hidden="true">
        {children}
      </div>
      <button
        type="button"
        onClick={(e) => {
          // 카드 전체 링크로 넘어가지 않고 이 자리에서 연다
          e.preventDefault();
          e.stopPropagation();
          open(postId);
        }}
        className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/30 px-3 text-center text-white ${
          variant === "full" ? "gap-2 text-base" : "text-xs"
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={variant === "full" ? "size-8" : "size-5"}>
          <path d="M3 3l18 18M10.6 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
        <span className="font-semibold">가림 표시 · {label}</span>
        <span className={variant === "full" ? "rounded-full border border-white/70 px-4 py-1.5 text-sm" : "opacity-90"}>눌러서 보기</span>
      </button>
    </div>
  );
}
