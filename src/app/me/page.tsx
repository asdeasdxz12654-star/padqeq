import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { getFollowedTags } from "@/lib/tags/follows";
import { TagChip } from "@/components/tag-chip";
import { currentYearKst } from "@/lib/year-chips";
import { signOut } from "./actions";
import { type CreditClaim, CreditClaims } from "./credit-claims";
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
  const [{ data: full }, openReports, creditRows, followedTags, claimRows] = await Promise.all([
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
    getFollowedTags(viewer.id),
    // 내 글의 미가입 크레딧에 온 연결 요청 (RLS: 작성자 · 요청자만)
    supabase
      .from("credit_claims")
      .select(
        "id, note, claimant_id, claimant:profiles!credit_claims_claimant_id_fkey(handle), credit:credits!credit_claims_credit_id_fkey(role, external_label, post:posts!credits_post_id_fkey(id, title, author_id))",
      )
      .eq("status", "open")
      .neq("claimant_id", viewer.id)
      .order("created_at")
      .limit(50),
  ]);
  const creditClaims: CreditClaim[] = (claimRows.data ?? []).flatMap((c) =>
    c.credit?.post && c.credit.post.author_id === viewer.id && c.claimant
      ? [
          {
            id: c.id,
            note: c.note,
            claimant: c.claimant.handle,
            label: c.credit.external_label ?? "",
            role: c.credit.role,
            postId: c.credit.post.id,
            postTitle: c.credit.post.title,
          },
        ]
      : [],
  );
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

      <Link
        href="/me/year"
        className="mt-8 flex min-h-14 items-center justify-between rounded-xl border border-line px-4 hover:border-quiet"
      >
        <span className="font-semibold">나의 {currentYearKst()}</span>
        <span className="text-xs text-quiet">한 해 동안 담은 사진 돌아보기 ›</span>
      </Link>

      {profile.role === "admin" && (
        <nav aria-label="운영" className="mt-8 flex flex-wrap gap-2">
          <Link href="/admin/reports" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
            신고 처리
            {openReports.count ? <span className="ml-2 rounded-full bg-red-500/20 px-2 text-red-300">{openReports.count}</span> : null}
          </Link>
        </nav>
      )}

      {creditRequests.length > 0 && <CreditRequests requests={creditRequests} />}
      {creditClaims.length > 0 && <CreditClaims claims={creditClaims} />}

      <section aria-labelledby="follows-heading" className="mt-10">
        <h2 id="follows-heading" className="mb-3 text-lg font-semibold">
          팔로우한 태그 <span className="text-sm font-normal text-quiet">{followedTags.length}</span>
        </h2>
        {followedTags.length ? (
          <>
            <ul className="flex flex-wrap gap-2">
              {followedTags.map((t) => (
                <li key={t.id}>
                  <TagChip tag={t} showKind={t.kind !== "general"} />
                </li>
              ))}
            </ul>
            <Link href="/?feed=following" className="mt-3 inline-block text-sm text-quiet underline underline-offset-4 hover:text-text">
              팔로우 피드 보기
            </Link>
          </>
        ) : (
          <p className="text-sm text-quiet">태그 페이지에서 팔로우하면 홈의 &lsquo;팔로우&rsquo;에 모여요.</p>
        )}
      </section>

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
