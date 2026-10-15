"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare Turnstile (가입 봇 방지, P-02). 폼 안에 두면 확인 값이 'cf-turnstile-response'로 함께 전송된다.
 * resetKey가 바뀌면 새로 확인한다 (확인 값은 한 번만 쓸 수 있으므로 서버가 거절한 뒤).
 */
export function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile));

  useEffect(() => {
    if (!loaded || !box.current || !window.turnstile) return;
    if (widget.current) {
      window.turnstile.reset(widget.current);
      return;
    }
    widget.current = window.turnstile.render(box.current, {
      sitekey: siteKey,
      theme: "auto",
      language: "ko",
      "response-field-name": "cf-turnstile-response",
    });
  }, [loaded, siteKey, resetKey]);

  useEffect(
    () => () => {
      if (widget.current) window.turnstile?.remove(widget.current);
    },
    [],
  );

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setLoaded(true)} />
      <div ref={box} className="min-h-[65px]" />
    </>
  );
}
