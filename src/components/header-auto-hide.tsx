"use client";

import { useEffect } from "react";

/**
 * 휴대폰 상단 바 (S-02 ①): 아래로 내리면 숨기고, 조금이라도 올리면 다시 보인다.
 * 맨 위 근처 · 검색창을 쓰는 중 · 게시물을 겹쳐 연 동안에는 늘 보인다. 화면 폭 판단 · 움직임은 CSS가 맡는다 (globals.css).
 */
export function HeaderAutoHide() {
  useEffect(() => {
    const root = document.documentElement;
    let last = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - last;
      const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.closest("header");
      if (y < 64 || typing || document.querySelector("[data-overlay]")) root.removeAttribute("data-header-hidden");
      else if (delta > 6) root.setAttribute("data-header-hidden", "");
      else if (delta < -6) root.removeAttribute("data-header-hidden");
      if (Math.abs(delta) > 6) last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      root.removeAttribute("data-header-hidden");
    };
  }, []);
  return null;
}
