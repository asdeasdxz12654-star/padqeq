import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { getProfileByHandle } from "@/lib/profiles/get-profile";
import { NewMessageForm } from "./new-message-form";

export const metadata: Metadata = { title: "새 메시지", robots: { index: false } };

// 프로필의 '메시지'에서 시작 (이미 대화가 있으면 그 대화로 이어진다)
export default async function NewMessagePage({ searchParams }: PageProps<"/me/messages/new">) {
  const params = await searchParams;
  const handle = typeof params.to === "string" ? params.to : "";
  const back = `/me/messages/new?to=${encodeURIComponent(handle)}`;
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", back));
  if (!viewer.profile) redirect(withNext("/welcome", back));

  const profile = handle ? await getProfileByHandle(handle) : null;
  if (!profile || profile.id === viewer.id) notFound();

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 pb-16 md:px-6">
      <Link href="/me/messages" className="text-sm text-quiet hover:underline">
        ‹ 메시지
      </Link>
      <h1 className="mt-4 text-xl font-bold">@{profile.handle}에게 메시지</h1>
      <p className="mt-2 text-sm leading-relaxed text-quiet">
        상대가 나를 팔로우하지 않으면 &lsquo;메시지 요청&rsquo;으로 가요. 섭외 제안은 섭외 게시판에서 지원하면 문의서가 함께 붙어요.
      </p>
      <div className="mt-6">
        <NewMessageForm recipient={profile.id} />
      </div>
    </div>
  );
}
