"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile (봇 확인). 스크립트를 코드에서 직접 붙이므로
// CSP strict-dynamic 아래에서도 nonce 없이 실행된다.

type TurnstileApi = {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      language?: string;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "flexible" | "compact";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("turnstile"));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * 토큰은 한 번만 쓸 수 있다. 사용한 뒤에는 부모가 key를 바꿔 위젯을 새로 그린다.
 * onToken은 렌더마다 바뀌지 않는 함수(setState 등)를 넘긴다.
 */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        widgetId = api.render(box.current, {
          sitekey: siteKey,
          language: "ko",
          theme: "dark",
          size: "flexible",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onToken]);

  return <div ref={box} className="min-h-[65px]" />;
}
