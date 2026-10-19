import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TagChip } from "@/components/tag-chip";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowedMembers, getFollowedTags } from "@/lib/follows/follows";
import { profileHref } from "@/lib/profiles/profile-href";

export const metadata: Metadata = { title: "팔로우", robots: { index: false } };

// 팔로우한 태그 · 회원 (나만 본다). 마이페이지에는 숫자 한 줄만 두고 목록은 여기서.
export default async function FollowsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/follows"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/follows"));
  const [followedTags, followedMembers] = await Promise.all([getFollowedTags(viewer.id), getFollowedMembers(viewer.id)]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-8 pb-16 md:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이페이지
        </Link>
        <h1 className="text-2xl font-bold">팔로우</h1>
        <p className="text-sm text-quiet">나만 볼 수 있어요. 팔로우한 태그 · 회원의 새 사진은 홈의 &lsquo;팔로우&rsquo;에 모여요.</p>
      </header>
      <section aria-labelledby="tags-heading" className="flex flex-col gap-3">
        <h2 id="tags-heading" className="font-semibold">
          태그 <span className="text-quiet">{followedTags.length}</span>
        </h2>
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
      </section>
      <section aria-labelledby="members-heading" className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 id="members-heading" className="font-semibold">
          회원 <span className="text-quiet">{followedMembers.length}</span>
        </h2>
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
      </section>
      {(followedTags.length > 0 || followedMembers.length > 0) && (
        <Link href="/?feed=following" className="self-start text-sm text-quiet underline underline-offset-4 hover:text-text">
          팔로우 피드 보기
        </Link>
      )}
    </div>
  );
}
