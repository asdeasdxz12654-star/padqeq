"use client";

import { useState } from "react";

/**
 * 공유 (P-04 공유): 휴대폰은 시스템 공유 시트(카카오톡 · 메시지 등), 안 되면 링크 복사.
 * 사진 파일은 보내지 않고 주소만 보낸다. 받은 사람은 해담에서 본다.
 */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
          try {
            await navigator.share({ title, url });
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("이 주소를 복사해 주세요", url);
        }
      }}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm hover:border-quiet"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </svg>
      <span aria-live="polite">{copied ? "링크를 복사했어요" : "공유"}</span>
    </button>
  );
}
