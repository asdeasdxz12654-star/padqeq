"use client";

import { useEffect } from "react";

/** 크롬 계열이 보내는 '설치할 수 있어요' 신호. 화면이 열릴 때 한 번 오므로 모든 화면에서 받아 둔다 (설치 안내 카드가 쓴다). */
export type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window {
    __haedamInstall?: InstallPromptEvent | null;
  }
}
export const INSTALL_READY = "haedam:install-ready";

/** 웹앱 오프라인 안내를 위해 서비스 워커를 등록한다 (public/sw.js). 화면 · 사진은 저장하지 않는다. */
export function SwRegister() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      // 브라우저의 기본 설치 띠 대신 우리 안내 카드에서 연다
      e.preventDefault();
      window.__haedamInstall = e as InstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_READY));
    };
    const onInstalled = () => {
      window.__haedamInstall = null;
      window.dispatchEvent(new Event(INSTALL_READY));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
