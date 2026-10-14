"use client";

import { useState, useSyncExternalStore } from "react";
import { detectInAppBrowser, externalOpenUrl } from "@/lib/support/in-app";

const DISMISS_KEY = "haedam:in-app-notice-dismissed";
const noop = () => () => {};

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 인앱 브라우저 안내 (S-20 ⑨). 로그인 · 업로드 화면에서만 쓴다.
 * Google 로그인은 앱 안 브라우저를 막으므로 기본 브라우저로 열도록 안내한다. 닫으면 그 세션 동안 숨긴다.
 */
export function InAppBrowserNotice({ purpose }: { purpose: "login" | "upload" }) {
  // 서버 렌더에서는 알 수 없으므로 브라우저에서만 판단한다
  const app = useSyncExternalStore(noop, () => detectInAppBrowser(navigator.userAgent), () => null);
  const initiallyDismissed = useSyncExternalStore(noop, readDismissed, () => false);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!app || dismissed || initiallyDismissed) return null;

  const openUrl = externalOpenUrl(navigator.userAgent, window.location.href);

  return (
    <div role="note" className="mb-6 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm leading-relaxed text-amber-100">
      <p className="font-semibold">{app} 앱 안에서 열었어요</p>
      <p className="mt-1">
        {purpose === "login"
          ? "Google 로그인은 앱 안에서는 막혀 있어요. 기본 브라우저(Safari · Chrome 등)에서 열어 주세요."
          : "사진 올리기는 기본 브라우저(Safari · Chrome 등)에서 더 안정적이에요."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {openUrl ? (
          <a href={openUrl} className="min-h-11 rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent">
            기본 브라우저로 열기
          </a>
        ) : (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent"
          >
            {copied ? "주소를 복사했어요" : "주소 복사"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // 저장할 수 없어도 지금 화면에서는 닫는다
            }
            setDismissed(true);
          }}
          className="min-h-11 rounded-xl border border-amber-400/40 px-4"
        >
          닫기
        </button>
      </div>
      {!openUrl && <p className="mt-2 text-xs text-amber-200/80">오른쪽 위(또는 아래) ⋯ 메뉴의 &lsquo;다른 브라우저로 열기&rsquo;를 써도 돼요.</p>}
    </div>
  );
}
