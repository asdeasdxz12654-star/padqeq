import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "../profile-form";

export const metadata: Metadata = { title: "프로필 고치기", robots: { index: false } };

// 마이에서 떼어 낸 프로필 편집 (마이는 허브, 고치기는 이 화면).
export default async function ProfileEditPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/edit"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/edit"));
  const { profile } = viewer;

  const supabase = await createClient();
  const { data: full } = await supabase.from("profiles").select("bio, links").eq("id", viewer.id).single();

  return (
    <div className="mx-auto max-w-xl px-4 pt-10 pb-16 md:px-6">
      <header className="flex flex-col gap-4">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이
        </Link>
        <h1 className="text-2xl font-bold">프로필 고치기</h1>
      </header>
      <div className="mt-6">
        <ProfileForm displayName={profile.display_name} bio={full?.bio ?? ""} links={full?.links ?? []} />
      </div>
      <p className="mt-3 text-xs text-quiet">핸들(@{profile.handle})은 크레딧 태그의 기준이라 바꿀 수 없어요.</p>
    </div>
  );
}
