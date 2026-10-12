"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Turnstile } from "@/components/turnstile";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import type { AuthProviders } from "@/lib/auth/providers";
import { createClient } from "@/lib/supabase/client";

// 로그인 요청은 브라우저에서 Supabase로 바로 보낸다.
// 서버를 거치면 모든 요청이 같은 IP로 보여 Supabase의 IP별 요청 제한에 한꺼번에 걸린다.

const RESEND_SECONDS = 60;

type Props = {
  next: string;
  providers: AuthProviders;
  turnstileSiteKey: string | null;
  initialError: string | null;
};

export function LoginPanel({ next, providers, turnstileSiteKey, initialError }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // 토큰은 한 번만 쓸 수 있으므로 요청할 때마다 위젯을 새로 그린다
  const [captchaRound, setCaptchaRound] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const callbackUrl = () => {
    const url = new URL("/auth/callback", window.location.origin);
    if (next !== "/") url.searchParams.set("next", next);
    return url.toString();
  };

  const needsCaptcha = turnstileSiteKey !== null;

  function signInWith(provider: "kakao" | "google") {
    setError(null);
    startTransition(async () => {
      const { error } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl() },
      });
      // 성공하면 브라우저가 로그인 화면으로 이동한다
      if (error) setError(authErrorMessage(error));
    });
  }

  function sendCode() {
    setError(null);
    startTransition(async () => {
      const { error } = await createClient().auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, captchaToken: captchaToken ?? undefined },
      });
      setCaptchaToken(null);
      setCaptchaRound((n) => n + 1);
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
    });
  }

  function verifyCode() {
    setError(null);
    startTransition(async () => {
      const { error } = await createClient().auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "email",
      });
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      // 세션 쿠키가 생겼으니 서버에서 가입 여부를 확인하고 알맞은 화면으로 보낸다
      window.location.assign(callbackUrl());
    });
  }

  const hasSocial = providers.kakao || providers.google;

  return (
    <div className="mt-10 flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {step === "email" && (
        <>
          {providers.kakao && (
            <button
              type="button"
              disabled={pending}
              onClick={() => signInWith("kakao")}
              // 카카오 로그인 버튼 디자인 가이드: 배경 #FEE500, 글자 85% 검정
              className="min-h-12 rounded-xl bg-[#FEE500] px-4 font-semibold text-black/85 disabled:opacity-60"
            >
              카카오로 계속하기
            </button>
          )}
          {providers.google && (
            <button
              type="button"
              disabled={pending}
              onClick={() => signInWith("google")}
              className="min-h-12 rounded-xl border border-line bg-white px-4 font-semibold text-[#1f1f1f] disabled:opacity-60"
            >
              Google로 계속하기
            </button>
          )}

          {hasSocial && (
            <div className="my-2 flex items-center gap-3 text-xs text-quiet" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              또는 이메일로
              <span className="h-px flex-1 bg-line" />
            </div>
          )}

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              이메일
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-12 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent"
              />
            </label>
            {turnstileSiteKey && (
              <Turnstile key={captchaRound} siteKey={turnstileSiteKey} onToken={setCaptchaToken} />
            )}
            <button
              type="submit"
              disabled={pending || (needsCaptcha && !captchaToken)}
              className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
            >
              {pending ? "보내는 중…" : "인증 코드 받기"}
            </button>
            <p className="text-xs leading-relaxed text-quiet">
              처음이면 자동으로 가입이 시작돼요. 비밀번호 없이 메일로 받은 코드로 로그인합니다.
            </p>
          </form>
        </>
      )}

      {step === "code" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            verifyCode();
          }}
        >
          <p className="text-sm leading-relaxed">
            <strong className="break-all">{email.trim()}</strong>(으)로 보낸 인증 코드를 입력해 주세요.
            <span className="block text-quiet">메일이 안 보이면 스팸함도 확인해 주세요.</span>
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            인증 코드
            <input
              name="code"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6,10}"
              maxLength={10}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="min-h-12 rounded-xl border border-line bg-surface px-3 text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={pending || code.length < 6}
            className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
          >
            {pending ? "확인 중…" : "확인"}
          </button>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              className="text-quiet underline-offset-4 hover:underline"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              다른 이메일로
            </button>
            <button
              type="button"
              disabled={pending || cooldown > 0 || (needsCaptcha && !captchaToken)}
              onClick={sendCode}
              className="text-accent underline-offset-4 hover:underline disabled:text-quiet disabled:no-underline"
            >
              {cooldown > 0 ? `${cooldown}초 뒤 다시 받기` : "코드 다시 받기"}
            </button>
          </div>
          {turnstileSiteKey && cooldown === 0 && (
            <Turnstile key={captchaRound} siteKey={turnstileSiteKey} onToken={setCaptchaToken} />
          )}
        </form>
      )}

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
