import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CALLBACK_ERRORS } from "@/lib/auth/auth-errors";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { loginProviders } from "@/lib/auth/providers";
import { getViewer } from "@/lib/auth/viewer";
import { InAppBrowserNotice } from "@/components/in-app-browser-notice";
import { LoginPanel } from "./login-panel";

export const metadata: Metadata = {
  title: "로그인 · 가입",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  const viewer = await getViewer();
  if (viewer) redirect(viewer.profile ? next : withNext("/welcome", next));

  const providers = await loginProviders();
  const error = typeof params.error === "string" ? (CALLBACK_ERRORS[params.error] ?? null) : null;

  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 pt-12 pb-16 md:pt-20">
      <InAppBrowserNotice purpose="login" kakaoLogin={providers.kakao} />
      <h1 className="text-3xl font-bold tracking-tight">해담</h1>
      <p className="mt-1 text-quiet">해마다, 잊지 않도록</p>
      <p className="mt-4 text-sm leading-relaxed text-quiet">
        그해의 코스프레 · 인물 · 풍경을 담아 두고 다시 꺼내 보는 갤러리
      </p>

      <LoginPanel next={next} providers={providers} initialError={error} />
    </div>
  );
}
