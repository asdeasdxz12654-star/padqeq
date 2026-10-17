"use client";

import { useEffect } from "react";

/** 웹앱 오프라인 안내를 위해 서비스 워커를 등록한다 (public/sw.js). 화면 · 사진은 저장하지 않는다. */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
