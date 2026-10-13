import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import Link from "next/link";
import { getPost } from "@/lib/posts/get-post";
import { profileHref } from "@/lib/profiles/profile-href";
import { TagChip } from "@/components/tag-chip";
import { createClient } from "@/lib/supabase/server";
import { ClaimCreditButton } from "./claim-credit-button";
import { HidePostButton } from "./hide-post-button";
import { ModerationNotice } from "./moderation-notice";
import { PhotoViewer } from "./photo-viewer";
import { RemoveCreditButton } from "./remove-credit-button";
import { RepublishButton } from "./republish-button";
import { ReportButton } from "./report-button";
import { WatermarkCheck } from "./watermark-check";

const ROLE_LABEL = {
  cosplayer: "코스어",
  model: "모델",
  photographer: "촬영",
  retoucher: "보정",
  other: "기타",
} as const;

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const post = await getPost((await params).id);
  if (!post) return { title: "볼 수 없는 게시물", robots: { index: false } };
  return {
    title: post.title,
    description: `@${post.author.handle} · ${CATEGORY_LABEL[post.category]} · ${post.shot_year}`,
    // 게시되지 않은 글(초안 · 숨김)은 검색에 넣지 않는다
    robots: post.status === "published" ? undefined : { index: false },
  };
}

// S-06 / S-07 게시물 상세 (1차: 사진 뷰어 · 정보 · 크레딧 · 숨김)
export default async function PostPage({ params }: PageProps<"/p/[id]">) {
  const [post, viewer] = await Promise.all([getPost((await params).id), getViewer()]);
  // 없는 글 · 볼 수 없는 글은 같은 화면 (존재 여부를 드러내지 않음)
  if (!post || post.photos.length === 0) notFound();

  const isAuthor = viewer?.id === post.author_id;
  const canHide = post.status === "published" && (isAuthor || viewer?.profile?.role === "admin");
  // 승인됐거나 외부 표기인 크레딧만 공개. 승인 대기는 작성자에게만 흐리게.
  // 미가입 크레딧 중 내가 이미 연결을 요청한 것
  const externalIds = post.credits.filter((c) => c.status === "external").map((c) => c.id);
  const claimed = new Set<string>();
  if (viewer?.profile && !isAuthor && externalIds.length) {
    const { data } = await (await createClient())
      .from("credit_claims")
      .select("credit_id")
      .eq("claimant_id", viewer.id)
      .eq("status", "open")
      .in("credit_id", externalIds);
    for (const row of data ?? []) claimed.add(row.credit_id);
  }
  const credits = post.credits.filter(
    (c) => c.status === "approved" || c.status === "external" || isAuthor || (viewer !== null && c.member_id === viewer.id && c.status === "pending"),
  );

  return (
    <article className="mx-auto max-w-[1440px] px-0 pt-4 pb-16 md:px-6 md:pt-6">
      {/* 작성자에게는 조치 안내 · 소명, 운영자에게는 상태만 */}
      {isAuthor && (post.removed_at || (post.status === "published" && post.held_at)) ? (
        <ModerationNotice postId={post.id} removed={Boolean(post.removed_at)} />
      ) : post.status === "published" && post.held_at ? (
        <p className="mx-4 mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 md:mx-0">
          신고로 임시 비공개 중이에요. 운영자가 확인할 때까지 다른 사람에게는 보이지 않아요.
        </p>
      ) : null}
      {post.status !== "published" && !(isAuthor && post.removed_at) && (
        <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm text-quiet md:mx-0">
          <p>
            {post.status === "draft" ? "아직 게시하지 않은 초안이에요." : post.removed_at ? "운영자가 게시를 중단한 글이에요." : "게시를 중단한 글이에요. 다른 사람에게는 보이지 않아요."}
          </p>
          {/* 내가 숨긴 글은 다시 게시할 수 있다 (운영자가 중단한 글은 소명으로만) */}
          {isAuthor && post.status === "hidden" && !post.removed_at && <RepublishButton postId={post.id} />}
        </div>
      )}

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_320px] md:gap-8">
        <PhotoViewer
          postId={post.id}
          initialPhotos={post.photos}
          watermark={viewer?.profile ? `@${viewer.profile.handle}` : null}
        />

        <div className="mt-6 flex flex-col gap-5 px-4 md:mt-0 md:px-0">
          <header className="flex flex-col gap-2">
            <h1 className="text-xl font-bold leading-snug">{post.title}</h1>
            <p className="text-sm">
              <Link href={profileHref(post.author.handle)} className="font-semibold hover:underline">
                @{post.author.handle}
              </Link>
              <span className="text-quiet"> · {post.author.display_name}</span>
            </p>
            <p className="text-xs text-quiet">
              {CATEGORY_LABEL[post.category]} · 촬영 {post.shot_on ? dateFormat.format(new Date(post.shot_on)) : `${post.shot_year}년`}
              {post.published_at && ` · 게시 ${dateFormat.format(new Date(post.published_at))}`}
            </p>
          </header>

          {post.body && <p className="whitespace-pre-line text-sm leading-relaxed">{post.body}</p>}

          {post.tags.length > 0 && (
            <ul aria-label="태그" className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <li key={tag.id}>
                  <TagChip tag={tag} />
                </li>
              ))}
            </ul>
          )}

          {credits.length > 0 && (
            <section aria-labelledby="credits-heading" className="flex flex-col gap-2">
              <h2 id="credits-heading" className="text-sm font-semibold">
                크레딧
              </h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {credits.map((c) => (
                  <li key={c.id} className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${c.status === "pending" ? "opacity-50" : ""}`}>
                    <span className="w-12 shrink-0 text-quiet">{ROLE_LABEL[c.role]}</span>
                    {c.member ? (
                      <Link href={profileHref(c.member.handle)} className="hover:underline">
                        @{c.member.handle}
                      </Link>
                    ) : c.external_url ? (
                      <a href={c.external_url} rel="nofollow noopener noreferrer ugc" target="_blank" className="underline underline-offset-2">
                        {c.external_label}
                      </a>
                    ) : (
                      <span>{c.external_label}</span>
                    )}
                    {c.status === "pending" && <span className="text-xs text-quiet">승인 대기</span>}
                    {viewer && c.member_id === viewer.id && !isAuthor && <RemoveCreditButton creditId={c.id} />}
                    {viewer?.profile && !isAuthor && c.status === "external" && (
                      <ClaimCreditButton creditId={c.id} label={c.external_label ?? ""} requested={claimed.has(c.id)} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs leading-relaxed text-quiet">
            © @{post.author.handle} · 무단 전재 및 AI 학습 이용 금지
          </p>

          {/* 남의 글은 신고할 수 있다 (비로그인은 로그인 후) */}
          {!isAuthor &&
            (viewer?.profile ? (
              <ReportButton postId={post.id} photoCount={post.photos.length} />
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(`/p/${post.id}`)}`}
                className="self-start text-sm text-quiet underline underline-offset-4"
              >
                신고
              </Link>
            ))}

          {isAuthor && (
            <Link href={`/p/${post.id}/edit`} className="self-start rounded-full border border-line px-3 py-1.5 text-sm hover:border-quiet">
              편집
            </Link>
          )}
          {canHide && <HidePostButton postId={post.id} />}
          {viewer?.profile?.role === "admin" && <WatermarkCheck postId={post.id} />}
        </div>
      </div>
    </article>
  );
}
