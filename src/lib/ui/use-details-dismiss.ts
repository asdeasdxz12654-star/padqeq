"use client";

import { type RefObject, useEffect } from "react";

/**
 * <details>로 만든 메뉴 · 작은 창: 바깥을 누르거나 Esc면 닫는다.
 * ignoreDialogs: 메뉴 안에서 연 창(신고 등 <dialog>)을 누른 것은 바깥으로 치지 않는다.
 */
export function useDetailsDismiss(ref: RefObject<HTMLDetailsElement | null>, { enabled = true, ignoreDialogs = false } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const close = (e: Event) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") d.open = false;
        return;
      }
      if (e.target instanceof Node && (d.contains(e.target) || (ignoreDialogs && (e.target as Element).closest?.("dialog")))) return;
      d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [ref, enabled, ignoreDialogs]);
}

/** 저장하지 않은 작업이 있으면 창을 닫거나 떠날 때 브라우저가 한 번 묻는다 */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
