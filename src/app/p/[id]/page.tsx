import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import Link from "next/link";
import { getComments } from "@/lib/comments/load";
import { OG_IMAGES } from "@/lib/og";
import { getPost } from "@/lib/posts/get-post";
import { getSiteSwitches } from "@/lib/support/switches";
import { profileHref } from "@/lib/profiles/profile-href";
import { TagChip } from "@/components/tag-chip";
import { createClient } from "@/lib/supabase/server";
import { ClaimCreditButton } from "./claim-credit-button";
import { ShareButton } from "@/components/share-button";
import { CollectPanel } from "./collect-panel";
import { Comments } from "./comments";
import { LikeButton } from "./like-button";
import { HidePostButton } from "./hide-post-button";
import { ModerationNotice } from "./moderation-notice";
import { PhotoViewer } from "./photo-viewer";
import { RemoveCreditButton } from "./remove-credit-button";
import { RepublishButton } from "./republish-button";
import { ReportButton } from "./report-button";
import { SaveButton } from "./save-button";
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
    openGraph: {
      type: "article",
      title: `${post.title} · 해담`,
      description: `@${post.author.handle}의 ${post.shot_year}년 ${CATEGORY_LABEL[post.category]} 사진 — 해담에서 보기`,
      url: `/p/${post.id}`,
      images: OG_IMAGES,
    },
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
  // 컬렉션에 담기: 내 글 · 내가 크레딧으로 승인된 글
  const canCollect =
    Boolean(viewer?.profile) && (isAuthor || post.credits.some((c) => viewer !== null && c.member_id === viewer.id && c.status === "approved"));
  let myCollections: { id: string; title: string; has: boolean }[] = [];
  if (canCollect && viewer) {
    const supabase = await createClient();
    const [{ data: mine }, { data: holding }] = await Promise.all([
      supabase.from("collections").select("id, title").eq("owner_id", viewer.id).order("updated_at", { ascending: false }).limit(100),
      supabase.from("collection_posts").select("collection_id").eq("post_id", post.id),
    ]);
    const has = new Set((holding ?? []).map((h) => h.collection_id));
    myCollections = (mine ?? []).map((c) => ({ id: c.id, title: c.title, has: has.has(c.id) }));
  }

  // 저장 여부 (게시된 글만 저장할 수 있다)
  const canSave = Boolean(viewer?.profile) && post.status === "published";
  // 좋아요 수 · 내가 눌렀는지 (볼 수 있는 글만)
  const { data: likeRows } = await (await createClient()).rpc("post_like_stats", { ids: [post.id] });
  const likeStats = likeRows?.[0] ?? null;
  const saved =
    canSave && viewer
      ? Boolean(
          (await (await createClient()).from("bookmarks").select("post_id").eq("user_id", viewer.id).eq("post_id", post.id).maybeSingle())
            .data,
        )
      : false;
  // 댓글: 게시된 글 · 정지 · 읽기 전용이 아닐 때 쓸 수 있다 (DB가 다시 막는다)
  const [{ comments, count: commentCount }, switches] = await Promise.all([getComments(post.id), getSiteSwitches()]);
  const isAdmin = viewer?.profile?.role === "admin";
  const commentsClosed =
    post.status !== "published" || post.held_at
      ? "게시된 글에만 댓글을 달 수 있어요."
      : viewer?.restriction
        ? "이용이 제한된 기간이라 댓글을 달 수 없어요."
        : switches.readOnly && !isAdmin
          ? "지금은 보기만 할 수 있어요."
          : null;

  const credits = post.credits.filter(
    (c) => c.status === "approved" || c.status === "external" || isAuthor || (viewer !== null && c.member_id === viewer.id && c.status === "pending"),
  );

  return (
    <article className="mx-auto max-w-[1440px] px-0 pt-4 pb-16 md:px-6 md:pt-6">
      {/* 작성자에게는 조치 안내 · 소명, 운영자에게는 상태만 */}
      {isAuthor && (post.removed_at || (post.status === "published" && post.held_at)) ? (
        <ModerationNotice postId={post.id} removed={Boolean(post.removed_at)} actionAt={(post.removed_at ?? post.held_at)!} />
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
            {post.status === "published" && !post.held_at && (
              <div className="flex flex-wrap items-center gap-2">
                <LikeButton
                  postId={post.id}
                  initial={likeStats?.liked ?? false}
                  count={likeStats?.likes ?? 0}
                  loginHref={viewer?.profile ? null : `/login?next=${encodeURIComponent(`/p/${post.id}`)}`}
                />
                {canSave ? (
                  <SaveButton postId={post.id} initial={saved} />
                ) : (
                  !viewer && (
                    <Link
                      href={`/login?next=${encodeURIComponent(`/p/${post.id}`)}`}
                      className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent"
                    >
                      저장
                    </Link>
                  )
                )}
                <ShareButton path={`/p/${post.id}`} title={post.title} />
              </div>
            )}
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

          {canCollect && <CollectPanel postId={post.id} collections={myCollections} />}
          {isAuthor && (
            <Link href={`/p/${post.id}/edit`} className="self-start rounded-full border border-line px-3 py-1.5 text-sm hover:border-quiet">
              편집
            </Link>
          )}
          {canHide && <HidePostButton postId={post.id} />}
          {viewer?.profile?.role === "admin" && <WatermarkCheck postId={post.id} />}

          <Comments
            postId={post.id}
            comments={comments}
            count={commentCount}
            viewerId={viewer?.profile ? viewer.id : null}
            isPostAuthor={isAuthor}
            isAdmin={isAdmin}
            canWrite={Boolean(viewer?.profile) && commentsClosed === null}
            closedReason={viewer?.profile ? commentsClosed : null}
            loginHref={`/login?next=${encodeURIComponent(`/p/${post.id}#comments`)}`}
          />
        </div>
      </div>
    </article>
  );
}
