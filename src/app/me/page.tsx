import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { ROLE_LABEL, isStaffRole } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { getFollowedMembers, getFollowedTags } from "@/lib/follows/follows";
import { TagChip } from "@/components/tag-chip";
import { currentYearKst } from "@/lib/year-chips";
import { signOut } from "./actions";
import { type CreditClaim, CreditClaims } from "./credit-claims";
import { type CreditRequest, CreditRequests } from "./credit-requests";

export const metadata: Metadata = {
  title: "마이",
  robots: { index: false },
};

// 마이(허브): 내 프로필 바로가기 · 받은 요청 · 바로가기 칸 · 팔로우 · 설정 · 로그아웃 (프로필 고치기는 /me/edit)
export default async function MePage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me"));
  const { profile } = viewer;

  const supabase = await createClient();
  const [{ data: full }, openReports, creditRows, followedTags, claimRows, followedMembers, openInquiries, { data: unreadThreads }] = await Promise.all([
    // 소개 · 링크는 프로필 고치기 화면(/me/edit)에서만 쓴다
    supabase.from("profiles").select("deletion_requested_at").eq("id", viewer.id).single(),
    isStaffRole(profile.role)
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
    getFollowedMembers(viewer.id),
    profile.role === "admin"
      ? supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "open")
      : Promise.resolve({ count: null }),
    supabase.rpc("unread_thread_count"),
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
    <div className="mx-auto max-w-xl md:max-w-2xl px-4 pt-10 pb-16 md:px-6">
      {full?.deletion_requested_at && (
        <p className="mb-6 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
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
            {profile.role !== "member" && (
              <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-text">{ROLE_LABEL[profile.role]}</span>
            )}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={profileHref(profile.handle)}
          className="flex min-h-11 items-center justify-center rounded-full bg-text text-sm font-bold text-bg"
        >
          내 프로필 보기
        </Link>
        <Link href="/me/edit" className="flex min-h-11 items-center justify-center rounded-full border border-line text-sm font-bold hover:border-quiet">
          프로필 고치기
        </Link>
      </div>
      {/* 로그아웃은 아래 바로가기 카드에 없어서 여기 둔다 (설정은 카드에 있다) */}
      <form action={signOut} className="mt-2">
        <button
          type="submit"
          className="flex min-h-11 w-full items-center justify-center rounded-full border border-line text-sm font-semibold text-quiet hover:border-quiet hover:text-text"
        >
          로그아웃
        </button>
      </form>

      {/* 받은 요청함: 크레딧 승인 · 크레딧 연결 요청 (알림 화면에서도 여기로) */}
      {(creditRequests.length > 0 || creditClaims.length > 0) && (
        <section id="requests" aria-label="받은 요청" className="mt-8 scroll-mt-20 rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
          <p className="text-sm font-bold text-accent">받은 요청 {creditRequests.length + creditClaims.length}건</p>
          {creditRequests.length > 0 && <CreditRequests requests={creditRequests} />}
          {creditClaims.length > 0 && <CreditClaims claims={creditClaims} />}
        </section>
      )}

      {/* 아래 묶음마다 가는 선으로 나눠 둔다 (여백만으로는 어디서 끊기는지 알기 어렵다) */}
      <h2 className="mt-8 border-t border-line pt-8 text-lg font-semibold">바로가기</h2>
      <nav aria-label="바로가기" className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { href: "/me/saved", title: "저장한 사진", sub: "나만 보는 모음", icon: "M6 4h12v17l-6-4-6 4z" },
          { href: "/me/collections", title: "내 컬렉션", sub: "이름 붙인 묶음", icon: "M4 6h16v12H4zM4 10h16" },
          { href: "/me/messages", title: "메시지", sub: "대화 · 섭외 문의", icon: "M4 5h16v11H8l-4 4z", badge: unreadThreads || 0 },
          { href: "/me/year", title: `나의 ${currentYearKst()}`, sub: "한 해 돌아보기", icon: "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4" },
          { href: "/memories", title: "N년 전 오늘", sub: "예전 오늘의 사진", icon: "M12 7v5l3 2M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" },
          { href: "/me/creator", title: "크리에이터 정보", sub: "역할 · 섭외 가능", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9c.6-4 3.4-6 7-6s6.4 2 7 6" },
          { href: "/help", title: "고객센터", sub: "공지 · 1:1 문의", icon: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" },
          { href: "/settings", title: "설정", sub: "계정 · 알림 · 화면", icon: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-24 flex-col justify-between gap-2 rounded-2xl border border-line p-3.5 hover:border-quiet"
          >
            <span className="flex items-center justify-between">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.badge ? <span className="rounded-full bg-accent px-2 text-xs font-bold text-on-accent">{item.badge}</span> : null}
            </span>
            <span>
              <span className="block text-sm font-bold">{item.title}</span>
              <span className="block text-xs text-quiet">{item.sub}</span>
            </span>
          </Link>
        ))}
      </nav>

      {isStaffRole(profile.role) && (
        <nav aria-label="운영" className="mt-8 flex flex-wrap gap-2 border-t border-line pt-8">
          {profile.role === "admin" && (
            <Link href="/admin" className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:border-quiet">
              운영 홈
            </Link>
          )}
          <Link href="/admin/reports" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
            신고 처리
            {openReports.count ? <span className="ml-2 rounded-full bg-danger-soft px-2 text-danger">{openReports.count}</span> : null}
          </Link>
          <Link href="/admin/members" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
            회원 관리
          </Link>
          {profile.role === "admin" && (
            <>
              <Link href="/admin/posts" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
                게시물 관리
              </Link>
              <Link href="/admin/events" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
                행사 관리
              </Link>
              <Link href="/admin/support" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
                고객센터 운영
                {openInquiries.count ? <span className="ml-2 rounded-full bg-danger-soft px-2 text-danger">{openInquiries.count}</span> : null}
              </Link>
              <Link href="/admin/audit" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
                감사 로그
              </Link>
            </>
          )}
        </nav>
      )}

      <section aria-labelledby="follows-heading" className="mt-8 flex flex-col gap-4 border-t border-line pt-8">
        <h2 id="follows-heading" className="text-lg font-semibold">
          팔로우 <span className="text-sm font-normal text-quiet">나만 볼 수 있어요</span>
        </h2>
        <div>
          <h3 className="mb-2 text-sm text-quiet">태그 {followedTags.length}</h3>
          {followedTags.length ? (
            <ul className="flex flex-wrap gap-2">
              {followedTags.map((t) => (
                <li key={t.id}>
                  <TagChip tag={t} showKind={t.kind !== "general"} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-quiet">태그 페이지에서 팔로우할 수 있어요.</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm text-quiet">회원 {followedMembers.length}</h3>
          {followedMembers.length ? (
            <ul className="flex flex-wrap gap-2">
              {followedMembers.map((m) => (
                <li key={m.id}>
                  <Link href={profileHref(m.handle)} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm hover:border-quiet">
                    @{m.handle}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-quiet">작가 · 모델의 프로필에서 팔로우할 수 있어요.</p>
          )}
        </div>
        {(followedTags.length > 0 || followedMembers.length > 0) && (
          <Link href="/?feed=following" className="self-start text-sm text-quiet underline underline-offset-4 hover:text-text">
            팔로우 피드 보기
          </Link>
        )}
      </section>

    </div>
  );
}
