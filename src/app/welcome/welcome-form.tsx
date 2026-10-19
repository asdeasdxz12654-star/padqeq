"use client";

import { LOGIN_METHOD_ITEMS, type LoginMethod } from "@/lib/auth/login-method";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { HANDLE_PATTERN, MIN_AGE } from "@/lib/auth/signup-input";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "@/components/turnstile";
import { completeSignup, type SignupErrors } from "./actions";

type HandleCheck = "idle" | "checking" | "ok" | "invalid" | "reserved" | "taken" | "error";

const HANDLE_HINT: Record<HandleCheck, { text: string; tone: "quiet" | "ok" | "bad" } | null> = {
  idle: { text: "영문 소문자 · 숫자 · _ 3~20자. 크레딧 태그(@)에 쓰여요.", tone: "quiet" },
  checking: { text: "확인 중…", tone: "quiet" },
  ok: { text: "사용할 수 있는 핸들이에요.", tone: "ok" },
  invalid: { text: "영문 소문자 · 숫자 · _ 로 3~20자를 입력해 주세요.", tone: "bad" },
  reserved: { text: "쓸 수 없는 핸들이에요.", tone: "bad" },
  taken: { text: "이미 쓰고 있는 핸들이에요.", tone: "bad" },
  error: null,
};

const TONE = { quiet: "text-quiet", ok: "text-ok", bad: "text-danger" } as const;

const inputClass =
  "min-h-12 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent aria-[invalid=true]:border-danger-line";

export function WelcomeForm({
  next,
  loginMethod,
  suggestedName,
  today,
  turnstileSiteKey,
}: {
  next: string;
  /** 이 계정의 로그인 방법 (모르면 두 방법을 함께 알린다) */
  loginMethod: LoginMethod | null;
  suggestedName: string;
  today: string;
  turnstileSiteKey: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const [handle, setHandle] = useState("");
  const [checked, setChecked] = useState<{ handle: string; status: HandleCheck } | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [pending, startTransition] = useTransition();

  const formatOk = HANDLE_PATTERN.test(handle);
  const check: HandleCheck =
    handle === "" ? "idle" : !formatOk ? "invalid" : checked?.handle === handle ? checked.status : "checking";

  // 입력이 멈추고 0.4초 뒤 중복 · 예약어 검사
  useEffect(() => {
    if (!formatOk) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const { data, error } = await createClient().rpc("handle_status", { target: handle });
      if (!stale) setChecked({ handle, status: error ? "error" : (data as HandleCheck) });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [handle, formatOk]);

  const hint = errors.handle ? { text: errors.handle, tone: "bad" as const } : HANDLE_HINT[check];
  const allAgreed = agreeTerms && agreePrivacy;

  return (
    <form
      noValidate
      className="mt-8 flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          // 성공하면 서버가 다음 화면으로 보낸다. 돌아온 값은 오류뿐이다.
          setErrors(await completeSignup(formData));
          // 실패했으면 Turnstile 확인 값을 새로 받는다 (한 번만 쓸 수 있음)
          setAttempt((n) => n + 1);
        });
      }}
    >
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="handle" className="text-sm font-medium">
          핸들
        </label>
        <div className="flex items-center rounded-xl border border-line bg-surface focus-within:border-accent">
          <span className="pl-3 text-quiet" aria-hidden="true">
            @
          </span>
          <input
            id="handle"
            name="handle"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            value={handle}
            aria-invalid={Boolean(errors.handle) || ["invalid", "reserved", "taken"].includes(check)}
            aria-describedby="handle-hint"
            onChange={(e) => {
              setHandle(e.target.value.toLowerCase().replace(/\s/g, ""));
              setErrors((prev) => ({ ...prev, handle: undefined }));
            }}
            className="min-h-12 flex-1 bg-transparent px-1 pr-3 text-base outline-none"
          />
        </div>
        <p id="handle-hint" aria-live="polite" className={`text-xs ${hint ? TONE[hint.tone] : ""}`}>
          {hint?.text}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-sm font-medium">
          표시 이름
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={40}
          autoComplete="nickname"
          defaultValue={suggestedName}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby="displayName-hint"
          className={inputClass}
        />
        <p id="displayName-hint" className={`text-xs ${errors.displayName ? TONE.bad : TONE.quiet}`}>
          {errors.displayName ?? "프로필과 게시물에 보이는 이름이에요. 나중에 바꿀 수 있어요."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="birthDate" className="text-sm font-medium">
          생년월일
        </label>
        <input
          id="birthDate"
          name="birthDate"
          type="date"
          required
          min="1900-01-01"
          max={today}
          autoComplete="bday"
          aria-invalid={Boolean(errors.birthDate)}
          aria-describedby="birthDate-hint"
          className={`${inputClass} [color-scheme:dark]`}
        />
        <p id="birthDate-hint" className={`text-xs ${errors.birthDate ? TONE.bad : TONE.quiet}`}>
          {errors.birthDate ?? `만 ${MIN_AGE}세 이상인지 확인하는 데만 쓰고 저장하지 않아요.`}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <legend className="sr-only">약관 동의</legend>
        <label className="flex items-center gap-3 font-semibold">
          <input
            type="checkbox"
            checked={allAgreed}
            onChange={(e) => {
              setAgreeTerms(e.target.checked);
              setAgreePrivacy(e.target.checked);
            }}
            className="size-5 accent-[var(--accent)]"
          />
          모두 동의
        </label>
        <hr className="border-line" />
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="agreeTerms"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          <span className="flex-1">[필수] 이용약관 동의</span>
          <Link href="/terms" target="_blank" className="text-xs text-quiet underline underline-offset-2">
            보기
          </Link>
        </label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="agreePrivacy"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="size-5 accent-[var(--accent)]"
            />
            <span className="flex-1">[필수] 개인정보 수집 · 이용 동의</span>
            <Link href="/privacy" target="_blank" className="text-xs text-quiet underline underline-offset-2">
              보기
            </Link>
          </label>
          {/* 개인정보보호법: 수집 항목 · 목적 · 보유 기간을 동의 받을 때 알린다 */}
          <dl className="ml-8 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-quiet">
            <dt>항목</dt>
            <dd>{loginMethod ? LOGIN_METHOD_ITEMS[loginMethod] : Object.values(LOGIN_METHOD_ITEMS).join(" 또는 ")}, 핸들, 표시 이름, 로그인 기록</dd>
            <dt>목적</dt>
            <dd>회원 식별, 서비스 제공, 부정 이용 방지</dd>
            <dt>보유</dt>
            <dd>탈퇴할 때까지 (법령이 정한 기록은 정한 기간까지)</dd>
          </dl>
        </div>
        {errors.agree && <p className="text-xs text-danger">{errors.agree}</p>}
      </fieldset>

      {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} resetKey={attempt} />}

      {errors.form && (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !allAgreed || check === "checking"}
        className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
      >
        {pending ? "저장 중…" : "시작하기"}
      </button>
    </form>
  );
}
