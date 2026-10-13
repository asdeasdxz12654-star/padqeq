import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { type CreditRequest, CreditRequests } from "./credit-requests";
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
  const [{ data: full }, openReports, creditRows] = await Promise.all([
    supabase.from("profiles").select("bio, deletion_requested_at").eq("id", viewer.id).single(),
    profile.role === "admin"
      ? supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open")
      : Promise.resolve({ count: null }),
    // 나를 태그했고 아직 답하지 않은 크레딧 (게시된 글만 보인다, RLS)
    supabase
      .from("credits")
      .select("id, role, post:posts!credits_post_id_fkey(id, title, author_id, author:profiles!posts_author_id_fkey(handle))")
      .eq("member_id", viewer.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const creditRequests: CreditRequest[] = (creditRows.data ?? []).flatMap((c) =>
    c.post && c.post.author_id !== viewer.id
      ? [{ id: c.id, role: c.role, postId: c.post.id, postTitle: c.post.title, uploader: c.post.author?.handle ?? "" }]
      : [],
  );

  return (
    <div className="mx-auto max-w-xl px-4 pt-10 pb-16 md:px-6">
      {full?.deletion_requested_at && (
        <p className="mb-6 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          계정 삭제가 예약돼 있어요. 다른 사람에게는 내 프로필과 게시물이 보이지 않아요.{" "}
          <Link href="/settings" className="font-semibold underline underline-offset-2">
            설정에서 취소
          </Link>
        </p>
      )}
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

      {profile.role === "admin" && (
        <nav aria-label="운영" className="mt-8 flex flex-wrap gap-2">
          <Link href="/admin/reports" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
            신고 처리
            {openReports.count ? <span className="ml-2 rounded-full bg-red-500/20 px-2 text-red-300">{openReports.count}</span> : null}
          </Link>
        </nav>
      )}

      {creditRequests.length > 0 && <CreditRequests requests={creditRequests} />}

      <section aria-labelledby="edit-heading" className="mt-10">
        <h2 id="edit-heading" className="mb-4 text-lg font-semibold">
          프로필 편집
        </h2>
        <ProfileForm displayName={profile.display_name} bio={full?.bio ?? ""} />
        <p className="mt-3 text-xs text-quiet">핸들(@{profile.handle})은 크레딧 태그의 기준이라 바꿀 수 없어요.</p>
      </section>

      <Link
        href="/settings"
        className="mt-12 flex min-h-12 items-center justify-between rounded-xl border border-line px-4 text-sm font-semibold hover:border-quiet"
      >
        설정 <span className="text-xs font-normal text-quiet">계정 · 내 데이터 · 계정 삭제 ›</span>
      </Link>

      <form action={signOut} className="mt-6 border-t border-line pt-6">
        <button type="submit" className="min-h-12 w-full rounded-xl border border-line px-4 text-sm font-semibold">
          로그아웃
        </button>
      </form>
    </div>
  );
}
