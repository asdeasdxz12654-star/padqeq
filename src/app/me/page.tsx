import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { FeedList } from "@/components/feed-list";
import { InstallCard } from "@/components/install-card";
import { YearShelf } from "@/components/year-shelf";
import { getAdminPending } from "@/lib/admin/pending";
import { withNext } from "@/lib/auth/next-path";
import { isStaffRole } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowedMembers, getFollowedTags } from "@/lib/follows/follows";
import type { FeedScope } from "@/lib/posts/feed-scope";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { getProfileByHandle } from "@/lib/profiles/get-profile";
import { profileHref } from "@/lib/profiles/profile-href";
import { loadYearShelf } from "@/lib/profiles/shelf";
import { createClient } from "@/lib/supabase/server";
import { type CreditClaim, CreditClaims } from "./credit-claims";
import { type CreditRequest, CreditRequests } from "./credit-requests";

export const metadata: Metadata = {
  title: "마이페이지",
  robots: { index: false },
};

const yearFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric" });

// 마이페이지 (마이 A안 · 캔버스 28–30): 나만 보는 것 + 나의 기록.
//  · 왼쪽(휴대폰은 위): 받은 요청(있을 때만) · 저장 · 컬렉션 · 내 글 관리 · 추억 · 팔로우 한 줄 · (운영진) 운영 화면
//  · 오른쪽(휴대폰은 아래): 나의 기록 — 연도 책장과 내 사진
// 프로필 수정 · 로그아웃은 설정으로, 메시지는 헤더로 옮겼다. 남에게 보이는 모습은 내 프로필(/@핸들).
export default async function MePage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me"));
  const { profile } = viewer;
  const staff = isStaffRole(profile.role);

  const supabase = await createClient();
  const scope: FeedScope = { kind: "author", authorId: viewer.id, year: null, month: null };
  const [mine, creditRows, claimRows, followedTags, followedMembers, hiddenCount, trashedCount, pending, first, { data: account }] = await Promise.all([
    getProfileByHandle(profile.handle),
    // 나를 태그했고 아직 답하지 않은 크레딧 (게시된 글만 보인다, RLS)
    supabase
      .from("credits")
      .select("id, role, post:posts!credits_post_id_fkey(id, title, author_id, author:profiles!posts_author_id_fkey(handle))")
      .eq("member_id", viewer.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
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
    getFollowedTags(viewer.id),
    getFollowedMembers(viewer.id),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", viewer.id).eq("status", "hidden").is("trashed_at", null),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", viewer.id).eq("trashed_by_author", true).not("trashed_at", "is", null),
    staff ? getAdminPending() : Promise.resolve(null),
    // 나의 기록: 내 사진
    loadScopePage(scope),
    supabase.from("profiles").select("deletion_requested_at, created_at").eq("id", viewer.id).single(),
  ]);
  const shelfYears = (await loadYearShelf(viewer.id, mine?.years ?? [])).filter((y) => y.count > 0);

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
  const requestCount = creditRequests.length + creditClaims.length;
  const hidden = hiddenCount.count ?? 0;
  const trashed = trashedCount.count ?? 0;
  const myProfile = profileHref(profile.handle);
  const row = "flex min-h-14 items-center justify-between gap-3 px-4 hover:bg-surface";

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-6 pb-16 md:grid md:grid-cols-[320px_minmax(0,1fr)] md:gap-10 md:px-6 md:pt-8">
      <aside className="flex flex-col gap-4 md:sticky md:top-20 md:self-start">
        <header className="flex items-center gap-3">
          <h1 className="sr-only">마이페이지</h1>
          <Avatar avatarKey={profile.avatar_key} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{profile.display_name}</p>
            <p className="truncate text-sm text-quiet">
              @{profile.handle}
              {account?.created_at && ` · ${yearFormat.format(new Date(account.created_at))}부터`}
            </p>
            <Link href={myProfile} className="text-sm text-quiet underline-offset-4 hover:text-text hover:underline">
              내 프로필 보기 ›
            </Link>
          </div>
          <Link href="/settings" aria-label="설정" className="flex size-11 shrink-0 items-center justify-center rounded-full text-quiet hover:bg-surface hover:text-text">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
            </svg>
          </Link>
        </header>

        {account?.deletion_requested_at && (
          <p className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
            계정 삭제가 예약돼 있어요. 다른 사람에게는 내 프로필과 게시물이 보이지 않아요.{" "}
            <Link href="/settings#delete-heading" className="font-semibold underline underline-offset-2">
              설정에서 취소
            </Link>
          </p>
        )}

        {/* 받은 요청: 크레딧 승인 · 크레딧 연결 요청 (있을 때만, 알림 화면에서도 여기로) */}
        {requestCount > 0 && (
          <section id="requests" aria-label="받은 요청" className="scroll-mt-20 rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <span aria-hidden="true" className="size-2 rounded-full bg-sun" />
              받은 요청 {requestCount}건
            </p>
            {creditRequests.length > 0 && <CreditRequests requests={creditRequests} />}
            {creditClaims.length > 0 && <CreditClaims claims={creditClaims} />}
          </section>
        )}

        <nav aria-label="나만 보는 것" className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line text-sm">
          <Link href="/me/saved" className={row}>
            저장 · 컬렉션 <span aria-hidden="true" className="text-quiet">›</span>
          </Link>
          <Link href="/me/posts" className={row}>
            내 글 관리
            <span className="text-xs text-quiet">{hidden > 0 || trashed > 0 ? `숨김 ${hidden} · 지운 글 ${trashed} ›` : "›"}</span>
          </Link>
          <Link href="/memories" className={row}>
            추억 <span className="text-xs text-quiet">이맘때 · 타임캡슐 · 나의 한 해 ›</span>
          </Link>
        </nav>

        <Link href="/me/follows" className="flex min-h-11 items-center text-sm text-quiet hover:text-text">
          팔로우 · 태그 {followedTags.length} · 회원 {followedMembers.length} ›
        </Link>

        {/* 웹앱 설치 안내 (설치했거나 닫았으면 보이지 않는다) */}
        <InstallCard />

        {/* 운영진에게만: 운영 화면 하나 (나머지 메뉴는 운영 화면 왼쪽에 있다) */}
        {staff && (
          <Link
            href={profile.role === "admin" ? "/admin" : "/admin/reports"}
            className="flex min-h-11 items-center justify-between rounded-xl border border-line px-4 text-sm hover:border-quiet"
          >
            운영 화면
            {pending && pending.total > 0 && <span className="rounded-full bg-danger-soft px-2 text-xs text-danger">처리할 일 {pending.total}</span>}
          </Link>
        )}
      </aside>

      <section aria-labelledby="record-heading" className="mt-8 flex min-w-0 flex-col gap-2 border-t border-line pt-6 md:mt-0 md:border-t-0 md:pt-0">
        <h2 id="record-heading" className="text-lg font-bold">
          나의 기록
        </h2>
        {shelfYears.length > 0 && (
          <div className="-mx-4 md:-mx-6">
            <YearShelf years={shelfYears} selected={null} hrefFor={(y) => (y === null ? myProfile : `${myProfile}?year=${y}`)} />
          </div>
        )}
        <div className="-mx-4 md:-mx-6">
          <FeedList scope={scope} initial={first} empty="아직 올린 사진이 없어요. '+' 올리기 버튼으로 첫 사진을 담아 보세요." />
        </div>
      </section>
    </div>
  );
}
