"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { createClient } from "@/lib/supabase/client";

// 로그인 · 가입은 카카오 · Google 계정으로 받는다 (해담은 비밀번호를 받지 않는다).
// 요청은 브라우저에서 Supabase로 바로 보낸다 (PKCE 확인값이 이 브라우저 쿠키에 남아야 함).

type Provider = "kakao" | "google";

// 이 기기에서 마지막으로 누른 로그인 방법 (다른 방법으로 새 계정을 만드는 실수를 줄인다). 이 브라우저에만 남는다.
const LAST_KEY = "haedam:last-login";
const noop = () => () => {};
function readLast(): Provider | null {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v === "kakao" || v === "google" ? v : null;
  } catch {
    return null;
  }
}

type Props = {
  next: string;
  providers: Record<Provider, boolean>;
  initialError: string | null;
};

export function LoginPanel({ next, providers, initialError }: Props) {
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();
  const [going, setGoing] = useState<Provider | null>(null);
  const last = useSyncExternalStore(noop, readLast, () => null);
  const recent = (p: Provider) =>
    last === p && (providers.kakao && providers.google) ? (
      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-semibold">최근 사용</span>
    ) : null;

  function signIn(provider: Provider) {
    setError(null);
    setGoing(provider);
    try {
      localStorage.setItem(LAST_KEY, provider);
    } catch {
      // 저장할 수 없어도 로그인은 계속한다
    }
    startTransition(async () => {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      if (next !== "/") redirectTo.searchParams.set("next", next);
      const { error } = await createClient().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo.toString(),
          // 여러 Google 계정이 있으면 고를 수 있게
          ...(provider === "google" && { queryParams: { prompt: "select_account" } }),
        },
      });
      // 성공하면 브라우저가 카카오 · Google 화면으로 이동한다
      if (error) {
        setError(authErrorMessage(error));
        setGoing(null);
      }
    });
  }

  return (
    <div className="mt-10 flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {providers.kakao && (
        <button
          type="button"
          disabled={pending}
          onClick={() => signIn("kakao")}
          // 카카오 로그인 버튼 가이드: #FEE500 배경 · 검정 말풍선 · 85% 검정 글자
          className="flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#FEE500] px-4 font-medium text-black/85 disabled:opacity-60"
        >
          <KakaoMark />
          {going === "kakao" ? "카카오로 이동 중…" : "카카오로 시작하기"}
          {recent("kakao")}
        </button>
      )}
      {providers.google && (
        <button
          type="button"
          disabled={pending}
          onClick={() => signIn("google")}
          // Google 로그인 버튼 가이드: 흰 배경 · 회색 테두리 · #1F1F1F 글자
          className="flex min-h-12 items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 font-medium text-[#1f1f1f] disabled:opacity-60"
        >
          <GoogleMark />
          {going === "google" ? "Google로 이동 중…" : "Google 계정으로 계속하기"}
          {recent("google")}
        </button>
      )}
      {!providers.kakao && !providers.google && (
        <p className="rounded-lg border border-line px-3 py-3 text-sm text-quiet">
          로그인을 준비하고 있어요. 잠시 뒤 다시 찾아 주세요.
        </p>
      )}

      <p className="text-xs leading-relaxed text-quiet">
        처음이면 로그인 뒤 핸들을 정하면 가입이 끝나요. 해담은 비밀번호를 받지 않아요.
        {providers.kakao && providers.google && " 이미 가입했다면 처음 가입한 방법으로 로그인해 주세요. 다른 방법으로 들어오면 새 계정이 만들어져요."}
      </p>

      <p className="mt-6 text-center text-xs leading-relaxed text-quiet">
        만 14세 이상 가입할 수 있어요 ·{" "}
        <Link href="/terms" className="underline underline-offset-2">
          이용약관
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          개인정보처리방침
        </Link>
      </p>
    </div>
  );
}

/** 카카오 말풍선 심볼 (외부 이미지 금지 CSP라 인라인 SVG) */
function KakaoMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <path fill="#000" d="M12 3.5c-5.25 0-9.5 3.3-9.5 7.36 0 2.62 1.76 4.92 4.41 6.22l-.9 3.3c-.08.3.26.53.52.36l3.94-2.6c.5.06 1.01.1 1.53.1 5.25 0 9.5-3.3 9.5-7.38S17.25 3.5 12 3.5z" />
    </svg>
  );
}

/** Google "G" 로고 (외부 이미지 금지 CSP라 인라인 SVG) */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
