"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KAKAO_JS_KEY, shareToKakao } from "@/lib/share/kakao";

/**
 * 공유 (P-04 공유): 카카오톡으로 보내기 · 링크 복사 · (휴대폰) 다른 앱으로.
 * 사진 파일은 보내지 않고 주소만 보낸다. 받은 사람은 해담에서 본다.
 * 카카오 키가 없으면 예전처럼 바로 휴대폰 공유 시트 → 안 되면 링크 복사.
 */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [note, setNote] = useState<string | null>(null);
  // 휴대폰 공유 시트가 있는 브라우저만 (서버에서는 모르므로 처음에는 숨김)
  const canShare = useSyncExternalStore(
    () => () => {},
    () => "share" in navigator,
    () => false,
  );
  const box = useRef<HTMLDetailsElement>(null);
  const url = () => new URL(path, window.location.origin).toString();
  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(null), 2000);
  };
  const close = () => {
    if (box.current) box.current.open = false;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      flash("링크를 복사했어요");
    } catch {
      window.prompt("이 주소를 복사해 주세요", url());
    }
  };
  const nativeShare = async (): Promise<boolean> => {
    if (!navigator.share) return false;
    try {
      await navigator.share({ title, url: url() });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) return false;
    }
    return true;
  };

  // 바깥을 누르거나 Esc면 닫는다
  useEffect(() => {
    const onDown = (e: Event) => {
      const d = box.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") d.open = false;
        return;
      }
      if (e.target instanceof Node && d.contains(e.target)) return;
      d.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onDown);
    };
  }, []);

  const icon = (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
  const pill = "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm hover:border-quiet";

  if (!KAKAO_JS_KEY) {
    return (
      <button
        type="button"
        onClick={async () => {
          if (window.matchMedia("(pointer: coarse)").matches && (await nativeShare())) return;
          await copy();
        }}
        className={pill}
      >
        {icon}
        <span aria-live="polite">{note ?? "공유"}</span>
      </button>
    );
  }

  const item = "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-surface";
  return (
    <details ref={box} className="relative">
      <summary className={`${pill} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {icon}
        <span aria-live="polite">{note ?? "공유"}</span>
      </summary>
      <div className="absolute left-0 z-30 mt-2 flex w-56 flex-col rounded-2xl border border-line bg-bg p-1.5 shadow-xl">
        <button
          type="button"
          className={item}
          onClick={async () => {
            close();
            try {
              await shareToKakao(url());
            } catch {
              flash("카카오톡을 열지 못했어요");
            }
          }}
        >
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-md bg-[#FEE500] text-black">
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
              <path d="M12 3.5c-5.25 0-9.5 3.3-9.5 7.36 0 2.62 1.76 4.92 4.41 6.22l-.9 3.3c-.08.3.26.53.52.36l3.94-2.6c.5.06 1.01.1 1.53.1 5.25 0 9.5-3.3 9.5-7.38S17.25 3.5 12 3.5z" />
            </svg>
          </span>
          카카오톡으로 보내기
        </button>
        <button
          type="button"
          className={item}
          onClick={async () => {
            close();
            await copy();
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 p-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </svg>
          링크 복사
        </button>
        {canShare && (
          <button
            type="button"
            className={item}
            onClick={async () => {
              close();
              await nativeShare();
            }}
          >
            <span aria-hidden="true" className="flex size-6 items-center justify-center">
              {icon}
            </span>
            다른 앱으로
          </button>
        )}
      </div>
    </details>
  );
}
