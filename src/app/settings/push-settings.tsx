"use client";

import { useEffect, useState, useTransition } from "react";
import { registerPush, unregisterPush } from "./push-actions";

type State = "checking" | "unsupported" | "ios-browser" | "denied" | "off" | "on";

const fromB64u = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

/**
 * 휴대폰 알림 (웹 푸시, S-11). 기기마다 켜고 끈다.
 * 아이폰 · 아이패드는 홈 화면에 추가한 해담 앱에서만 받을 수 있다 (iOS 16.4 이상).
 */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const apple = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(apple && !standalone ? "ios-browser" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      setState(subscription ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [publicKey]);

  const turnOn = () =>
    startTransition(async () => {
      setError(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey!) }));
        const result = await registerPush(subscription.endpoint);
        if (!result.ok) {
          await subscription.unsubscribe();
          setError(result.error);
          return;
        }
        setState("on");
      } catch {
        setError("이 브라우저에서 알림을 켜지 못했어요.");
      }
    });

  const turnOff = () =>
    startTransition(async () => {
      setError(null);
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await unregisterPush(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setState("off");
      } catch {
        setError("알림을 끄지 못했어요.");
      }
    });

  const help: Record<State, string> = {
    checking: "확인하는 중…",
    unsupported: "이 브라우저는 알림을 받을 수 없어요. 최신 Chrome · Edge · Safari · Firefox에서 열어 주세요.",
    "ios-browser": "아이폰 · 아이패드는 Safari 공유 › '홈 화면에 추가'로 해담 앱을 만든 뒤, 그 앱의 설정에서 켤 수 있어요 (iOS 16.4 이상).",
    denied: "이 사이트의 알림이 막혀 있어요. 브라우저(또는 기기) 설정 › 사이트 알림에서 해담을 허용한 뒤 다시 눌러 주세요.",
    off: "크레딧 요청 · 댓글 · 메시지 같은 새 알림을 이 기기로 받아요. 알림 내용은 해담에서 직접 가져와요.",
    on: "이 기기로 알림을 받고 있어요. 다른 기기는 그 기기에서 따로 켜요.",
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-quiet">{help[state]}</p>
      {(state === "off" || state === "on" || state === "denied") && (
        <button
          type="button"
          onClick={state === "on" ? turnOff : turnOn}
          disabled={pending}
          className={`min-h-11 self-start rounded-xl px-4 text-sm font-semibold disabled:opacity-50 ${state === "on" ? "border border-line" : "bg-accent text-on-accent"}`}
        >
          {pending ? "처리 중…" : state === "on" ? "이 기기에서 그만 받기" : "이 기기에서 알림 받기"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
