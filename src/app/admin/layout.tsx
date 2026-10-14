import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { MfaGate } from "./mfa-gate";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// 운영 화면. 운영자가 아니면 화면이 있다는 것도 드러내지 않는다 (404).
// 실제 권한은 DB(RLS · moderate_post)가 다시 확인한다.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await getViewer();
  // 운영자 계정이지만 2단계 인증 전이면 인증 화면만 보여 준다 (그 밖의 사람에게는 화면이 있다는 것도 숨김)
  if (viewer?.mfaRequired) return <MfaGate />;
  if (viewer?.profile?.role !== "admin") notFound();
  return <div className="mx-auto max-w-6xl px-4 pt-6 pb-16 md:px-6">{children}</div>;
}
