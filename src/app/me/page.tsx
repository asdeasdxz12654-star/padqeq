import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "마이",
  robots: { index: false },
};

// 마이: 내 프로필 바로가기 · 프로필 편집 · 로그아웃
export default async function MePage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me"));
  const { profile } = viewer;

  const supabase = await createClient();
  const { data: full } = await supabase.from("profiles").select("bio").eq("id", viewer.id).single();

  return (
    <div className="mx-auto max-w-xl px-4 pt-10 pb-16 md:px-6">
      <div className="flex items-center gap-4">
        <div aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-slot text-xl font-bold text-quiet">
          {profile.display_name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{profile.display_name}</h1>
          <p className="text-sm text-quiet">
            @{profile.handle}
            {profile.role === "admin" && (
              <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-text">운영자</span>
            )}
          </p>
        </div>
        <Link
          href={profileHref(profile.handle)}
          className="ml-auto shrink-0 rounded-full border border-line px-4 py-1.5 text-sm hover:border-quiet"
        >
          내 프로필 보기
        </Link>
      </div>

      <section aria-labelledby="edit-heading" className="mt-10">
        <h2 id="edit-heading" className="mb-4 text-lg font-semibold">
          프로필 편집
        </h2>
        <ProfileForm displayName={profile.display_name} bio={full?.bio ?? ""} />
        <p className="mt-3 text-xs text-quiet">핸들(@{profile.handle})은 크레딧 태그의 기준이라 바꿀 수 없어요.</p>
      </section>

      <form action={signOut} className="mt-12 border-t border-line pt-6">
        <button type="submit" className="min-h-12 w-full rounded-xl border border-line px-4 text-sm font-semibold">
          로그아웃
        </button>
      </form>
    </div>
  );
}
