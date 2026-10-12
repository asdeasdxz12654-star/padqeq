"use client";

import { useEffect } from "react";

// 사진 보호 (P-02 다운로드 차단 · 유출 억제). 웹에서는 완전히 막을 수 없고 억제만 한다.
//  · 사진 위 우클릭(다른 이름으로 저장) · 끌어서 저장 막기
//  · 창이 가려지거나 다른 창으로 넘어가면 사진을 흐리게 (화면 녹화 · 캡처 도구 억제)
export function PhotoGuard() {
  useEffect(() => {
    const onPhoto = (target: EventTarget | null) => target instanceof Element && target.closest(".photo-guard") !== null;
    const block = (e: Event) => {
      if (onPhoto(e.target)) e.preventDefault();
    };
    const root = document.documentElement;
    const setAway = (away: boolean) => root.classList.toggle("is-away", away);
    const onVisibility = () => setAway(document.visibilityState !== "visible");
    const onBlur = () => setAway(true);
    const onFocus = () => setAway(false);

    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
