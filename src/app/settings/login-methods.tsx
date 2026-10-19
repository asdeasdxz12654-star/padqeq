"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LOGIN_METHOD_LABEL, type LoginMethod } from "@/lib/auth/login-method";
import { createClient } from "@/lib/supabase/client";
import { confirmAction } from "@/lib/ui/confirm";

// 연결된 로그인 방법 (계정 연결): 로그인한 채로 다른 방법을 붙이면, 이메일이 달라도 어느 쪽으로 들어와도 같은 계정이다.
// 하나만 남은 방법은 끊을 수 없다 (Supabase도 막는다). 연결은 Supabase 대시보드의 Manual linking이 켜져 있어야 한다.

const ORDER: LoginMethod[] = ["kakao", "google"];

export const LINK_ERRORS: Record<string, string> = {
  identity_already_exists: "그 계정은 이미 다른 해담 계정에 연결돼 있어요. 그 계정으로 로그인해 확인해 주세요.",
  manual_linking_disabled: "지금은 로그인 방법을 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.",
  single_identity_not_deletable: "로그인 방법이 하나뿐이라 끊을 수 없어요.",
  oauth: "연결을 마치지 못했어요. 다시 시도해 주세요.",
};

export function LoginMethods({
  linked,
  available,
  initialError,
}: {
  /** 이 계정에 연결된 방법 */
  linked: LoginMethod[];
  /** 사이트에서 켜 둔 방법 */
  available: LoginMethod[];
  initialError: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();
  const shown = ORDER.filter((m) => linked.includes(m) || available.includes(m));

  function connect(method: LoginMethod) {
    setError(null);
    startTransition(async () => {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/settings");
      redirectTo.searchParams.set("link", "1");
      const { error } = await createClient().auth.linkIdentity({
        provider: method,
        options: {
          redirectTo: redirectTo.toString(),
          ...(method === "google" && { queryParams: { prompt: "select_account" } }),
        },
      });
      // 성공하면 브라우저가 카카오 · Google 화면으로 이동한다
      if (error) setError(LINK_ERRORS[error.code ?? ""] ?? LINK_ERRORS.oauth!);
    });
  }

  async function disconnect(method: LoginMethod) {
    const ok = await confirmAction({
      title: `${LOGIN_METHOD_LABEL[method]} 연결을 끊을까요?`,
      body: "다음부터는 남은 방법으로만 로그인할 수 있어요. 언제든 다시 연결할 수 있어요.",
      confirmLabel: "연결 끊기",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { data, error: listError } = await supabase.auth.getUserIdentities();
      const identity = data?.identities.find((i) => i.provider === method);
      if (listError || !identity) {
        setError(LINK_ERRORS.oauth!);
        return;
      }
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) {
        setError(LINK_ERRORS[error.code ?? ""] ?? "연결을 끊지 못했어요. 다시 시도해 주세요.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {shown.map((method) => {
          const on = linked.includes(method);
          return (
            <li key={method} className="flex min-h-14 items-center gap-3 px-4">
              <span className="flex-1 text-sm">
                {LOGIN_METHOD_LABEL[method]}
                {on && <span className="ml-2 text-xs text-ok">연결됨</span>}
              </span>
              {on ? (
                linked.length > 1 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => disconnect(method)}
                    className="min-h-10 rounded-full border border-line px-4 text-sm text-quiet hover:border-quiet disabled:opacity-60"
                  >
                    연결 끊기
                  </button>
                )
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => connect(method)}
                  className="min-h-10 rounded-full border border-line px-4 text-sm font-semibold hover:border-quiet disabled:opacity-60"
                >
                  연결하기
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-quiet">
        연결해 두면 어느 방법으로 들어와도 같은 계정이에요. 다른 해담 계정에 이미 쓰고 있는 카카오 · Google 계정은 연결할 수 없어요.
      </p>
    </div>
  );
}
