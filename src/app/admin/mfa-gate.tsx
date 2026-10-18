"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type State =
  | { step: "loading" }
  | { step: "enroll"; factorId: string; qr: string; secret: string }
  | { step: "verify"; factorId: string }
  | { step: "error"; message: string };

/**
 * 운영자 2단계 인증 (P-02 ② · A-01 ②). 인증 앱(Google Authenticator · 1Password 등)의 6자리 코드.
 * 처음이면 QR로 등록하고, 다음부터는 코드만 넣는다. 통과하면 세션이 aal2가 되어 운영 기능이 열린다.
 */
export function MfaGate() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) return setState({ step: "error", message: "2단계 인증 정보를 불러오지 못했어요. 새로 고침해 주세요." });
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setState({ step: "verify", factorId: verified.id });
      // 등록하다 그만둔 것은 지우고 새로 만든다
      for (const factor of data.all.filter((f) => f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `해담 운영 ${new Date().toISOString().slice(0, 10)}` });
      if (enrolled.error) return setState({ step: "error", message: "2단계 인증을 시작하지 못했어요. 새로 고침해 주세요." });
      setState({ step: "enroll", factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
    })();
  }, []);

  const verify = (factorId: string) =>
    startTransition(async () => {
      setError(null);
      const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) {
        setCode("");
        return setError("코드가 맞지 않아요. 인증 앱의 새 코드를 넣어 주세요.");
      }
      router.refresh();
    });

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 py-10">
      <h1 className="text-2xl font-bold">운영자 2단계 인증</h1>
      {state.step === "loading" && <p className="text-sm text-quiet">확인하는 중…</p>}
      {state.step === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.step === "enroll" && (
        <>
          <p className="text-sm leading-relaxed text-quiet">
            처음 한 번 등록해요. 휴대폰의 인증 앱(Google Authenticator, 1Password, Microsoft Authenticator 등)으로 아래 QR을 찍으세요.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- 인증 서버가 만든 QR (data: 주소) */}
          <img src={state.qr} alt="2단계 인증 등록용 QR 코드" width={200} height={200} className="self-center rounded-lg bg-white p-2" />
          <details className="text-xs text-quiet">
            <summary className="cursor-pointer">QR을 찍을 수 없으면</summary>
            <p className="mt-2 break-all font-mono">{state.secret}</p>
            <p className="mt-1">인증 앱에서 &lsquo;키 직접 입력&rsquo;을 고르고 위 값을 넣으세요.</p>
          </details>
        </>
      )}
      {(state.step === "enroll" || state.step === "verify") && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify(state.factorId);
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            인증 앱의 6자리 코드
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              className="min-h-12 rounded-xl border border-line bg-bg px-3 text-center font-mono text-2xl tracking-[0.4em]"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={code.length !== 6 || pending} className="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50">
            {pending ? "확인 중…" : "확인"}
          </button>
        </form>
      )}
      <p className="text-xs leading-relaxed text-quiet">
        휴대폰을 잃어버리면 Supabase 대시보드 › Authentication › Users에서 이 계정의 2단계 인증 요소를 지운 뒤 다시 등록하세요.
      </p>
    </div>
  );
}
