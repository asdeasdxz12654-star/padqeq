import type { Metadata } from "next";
import Link from "next/link";
import { type LoginMethod, parseLoginMethod } from "@/lib/auth/login-method";
import { loginProviders } from "@/lib/auth/providers";
import { createClient } from "@/lib/supabase/server";
import { settingsViewer } from "../load";
import { LINK_ERRORS, LoginMethods } from "../login-methods";
import { KST } from "@/lib/format/kst";

export const metadata: Metadata = { title: "계정 · 설정", robots: { index: false } };

const dayFormat = KST.dateLong;

// 설정 › 계정: 핸들 · 이메일 · 가입일 · 로그인 방법(계정 연결) · 받은 경고
export default async function SettingsAccountPage({ searchParams }: PageProps<"/settings/account">) {
  const linkErrorParam = (await searchParams).link_error;
  const viewer = await settingsViewer("/settings/account");
  const supabase = await createClient();
  const [{ data: userData }, providers, { data: claims }, { data: account }, { data: warnings }] = await Promise.all([
    // 연결된 로그인 방법 (계정 연결)
    supabase.auth.getUser(),
    loginProviders(),
    supabase.auth.getClaims(),
    supabase.from("profiles").select("created_at").eq("id", viewer.id).single(),
    // 받은 경고 (A-05 ⑥, 본인만 본다)
    supabase.from("member_warnings").select("id, reason, created_at").eq("member_id", viewer.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const email = typeof claims?.claims.email === "string" ? claims.claims.email : null;
  const linked = [...new Set((userData.user?.identities ?? []).flatMap((i) => parseLoginMethod(i.provider) ?? []))] as LoginMethod[];

  return (
    <>
      <section aria-labelledby="account-heading" className="flex flex-col gap-3">
        <h1 id="account-heading" className="text-lg font-semibold">
          계정
        </h1>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-quiet">핸들</dt>
          <dd>@{viewer.profile.handle}</dd>
          <dt className="text-quiet">이메일</dt>
          <dd className="break-all">{email ?? "-"}</dd>
          <dt className="text-quiet">가입일</dt>
          <dd>{account ? dayFormat.format(new Date(account.created_at)) : "-"}</dd>
        </dl>
        <h2 className="mt-2 text-sm font-semibold">로그인 방법</h2>
        <LoginMethods
          linked={linked}
          available={(["kakao", "google"] as const).filter((m) => providers[m])}
          initialError={typeof linkErrorParam === "string" ? (LINK_ERRORS[linkErrorParam] ?? LINK_ERRORS.oauth!) : null}
        />
      </section>

      {warnings && warnings.length > 0 && (
        <section id="warnings" aria-labelledby="warnings-heading" className="flex scroll-mt-28 flex-col gap-3 border-t border-line pt-8">
          <h2 id="warnings-heading" className="text-lg font-semibold">
            받은 경고
          </h2>
          <ul className="flex flex-col gap-2">
            {warnings.map((w) => (
              <li key={w.id} className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm">
                <p>{w.reason}</p>
                <p className="mt-1 text-xs text-quiet">{dayFormat.format(new Date(w.created_at))}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-quiet">
            같은 일이 되풀이되면 업로드 권한 회수나 이용 정지로 이어질 수 있어요. 이의가 있으면{" "}
            <Link href="/help" className="underline underline-offset-2">
              1:1 문의
            </Link>
            로 알려 주세요.
          </p>
        </section>
      )}
    </>
  );
}
