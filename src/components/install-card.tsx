"use client";

import { useState, useSyncExternalStore } from "react";
import { INSTALL_READY } from "./sw-register";
import { installMode } from "@/lib/support/install";

// 웹앱 설치 안내 카드 (마이페이지). 이미 설치했거나 닫았으면 보이지 않는다 (닫은 것은 이 기기에만 기억).
const DISMISS_KEY = "haedam:install-dismissed";

const subscribe = (notify: () => void) => {
  window.addEventListener(INSTALL_READY, notify);
  return () => window.removeEventListener(INSTALL_READY, notify);
};
const readMode = () =>
  installMode(navigator.userAgent, {
    standalone: window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    canPrompt: Boolean(window.__haedamInstall),
  });
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};
const noop = () => () => {};

export function InstallCard() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "none" as const);
  const dismissedBefore = useSyncExternalStore(noop, readDismissed, () => true);
  const [closed, setClosed] = useState(false);
  if (mode === "none" || mode === "installed" || dismissedBefore || closed) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 저장할 수 없어도 지금은 닫는다
    }
    setClosed(true);
  };

  return (
    <section aria-labelledby="install-heading" className="flex flex-col gap-2 rounded-2xl border border-line p-4 text-sm">
      <h2 id="install-heading" className="font-bold">
        해담을 앱처럼 쓰기
      </h2>
      {mode === "prompt" && (
        <>
          <p className="leading-relaxed text-quiet">홈 화면에 아이콘이 생기고, 주소창 없이 앱처럼 열려요. 알림도 받을 수 있어요.</p>
          <button
            type="button"
            onClick={async () => {
              const prompt = window.__haedamInstall;
              if (!prompt) return;
              await prompt.prompt();
              window.__haedamInstall = null;
              window.dispatchEvent(new Event(INSTALL_READY));
            }}
            className="min-h-11 self-start rounded-full bg-accent px-5 font-semibold text-on-accent"
          >
            앱으로 설치
          </button>
        </>
      )}
      {mode === "ios-safari" && (
        <ol className="list-decimal pl-5 leading-relaxed text-quiet">
          <li>
            아래 <strong className="text-text">공유 버튼</strong>(네모에서 위로 나가는 화살표)을 눌러요
          </li>
          <li>
            <strong className="text-text">홈 화면에 추가</strong>를 고르고 &lsquo;추가&rsquo;를 눌러요
          </li>
        </ol>
      )}
      {mode === "ios-other" && <p className="leading-relaxed text-quiet">아이폰은 Safari에서 열어야 홈 화면에 추가할 수 있어요. 이 주소를 Safari에서 열어 주세요.</p>}
      {mode === "in-app" && <p className="leading-relaxed text-quiet">앱 안 브라우저에서는 설치할 수 없어요. 기본 브라우저(Safari · Chrome)에서 열어 주세요.</p>}
      <button type="button" onClick={close} className="min-h-10 self-start text-xs text-quiet underline underline-offset-4 hover:text-text">
        다시 보지 않기
      </button>
    </section>
  );
}
