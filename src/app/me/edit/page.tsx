import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { createClient } from "@/lib/supabase/server";
import { AvatarForm } from "./avatar-form";
import { CoverPicker } from "./cover-picker";
import { ProfileForm } from "../profile-form";

export const metadata: Metadata = { title: "프로필 고치기", robots: { index: false } };

// 마이에서 떼어 낸 프로필 편집 (마이는 허브, 고치기는 이 화면).
export default async function ProfileEditPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/edit"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/edit"));
  const { profile } = viewer;

  const supabase = await createClient();
  const [{ data: full }, recent] = await Promise.all([
    supabase.from("profiles").select("bio, links, cover_post_id, avatar_key").eq("id", viewer.id).single(),
    // 커버로 고를 수 있는 내 사진 (최근 것부터)
    loadScopePage({ kind: "author", authorId: viewer.id, year: null, month: null }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 pb-16 md:px-6">
      <header className="flex flex-col gap-4">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이
        </Link>
        <h1 className="text-2xl font-bold">프로필 고치기</h1>
      </header>

      <section aria-labelledby="avatar-heading" className="mt-8 border-t border-line pt-8">
        <h2 id="avatar-heading" className="text-lg font-semibold">
          프로필 사진
        </h2>
        <p className="mt-1 mb-3 text-sm text-quiet">올리지 않으면 빈 자리로 둬요.</p>
        <AvatarForm initial={full?.avatar_key ?? null} />
      </section>

      <section aria-labelledby="cover-heading" className="mt-8 border-t border-line pt-8">
        <h2 id="cover-heading" className="text-lg font-semibold">
          커버 사진
        </h2>
        <p className="mt-1 mb-3 text-sm text-quiet">프로필 맨 위에 넓게 걸리는 사진이에요.</p>
        <CoverPicker posts={recent.items} initial={full?.cover_post_id ?? null} />
      </section>

      <section aria-labelledby="info-heading" className="mt-8 border-t border-line pt-8">
        <h2 id="info-heading" className="mb-4 text-lg font-semibold">
          이름 · 소개 · 링크
        </h2>
        <ProfileForm displayName={profile.display_name} bio={full?.bio ?? ""} links={full?.links ?? []} />
        <p className="mt-3 text-xs text-quiet">핸들(@{profile.handle})은 크레딧 태그의 기준이라 바꿀 수 없어요.</p>
      </section>
    </div>
  );
}
