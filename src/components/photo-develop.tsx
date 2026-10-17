"use client";

import { useEffect } from "react";

/**
 * 인화되는 순간: 사진이 다 받아지면 하얀 인화지에서 맺히듯 0.6초 동안 나타난다 (globals.css .develop-ready).
 * 이미 받아진 사진은 그대로 두고, 받는 중인 사진만 숨겼다가 다 받으면 보여 준다.
 * 스크립트가 돌기 전 · '움직임 줄이기'를 켠 기기에서는 아무 효과 없이 바로 보인다.
 */
export function PhotoDevelop() {
  useEffect(() => {
    const mark = (img: HTMLImageElement) => {
      img.dataset.loaded = "1";
    };
    for (const img of document.querySelectorAll<HTMLImageElement>(".photo-guard img")) if (img.complete) mark(img);
    const onLoad = (e: Event) => {
      if (e.target instanceof HTMLImageElement && e.target.closest(".photo-guard")) mark(e.target);
    };
    // 실패한 사진도 숨긴 채로 두지 않는다
    document.addEventListener("load", onLoad, true);
    document.addEventListener("error", onLoad, true);
    document.documentElement.classList.add("develop-ready");
    return () => {
      document.removeEventListener("load", onLoad, true);
      document.removeEventListener("error", onLoad, true);
      document.documentElement.classList.remove("develop-ready");
    };
  }, []);
  return null;
}
