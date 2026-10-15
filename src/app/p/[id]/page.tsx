import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { CREDIT_ROLE_LABEL } from "@/lib/photos/credit-input";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import Link from "next/link";
import { getComments } from "@/lib/comments/load";
import { getFollowedMembers } from "@/lib/follows/follows";
import { COMMENT_POLICY_LABEL, VISIBILITY_LABEL } from "@/lib/posts/audience";
import { OG_IMAGES } from "@/lib/og";
import { loadFeed } from "@/lib/posts/feed";
import { getPost } from "@/lib/posts/get-post";
import { getSiteSwitches } from "@/lib/support/switches";
import { todayKst } from "@/lib/auth/signup-input";
import { profileHref } from "@/lib/profiles/profile-href";
import { TagChip } from "@/components/tag-chip";
import { createClient } from "@/lib/supabase/server";
import { ClaimCreditButton } from "./claim-credit-button";
import { PhotoFeed } from "@/components/photo-feed";
import { ShareButton } from "@/components/share-button";
import { CollectPanel } from "./collect-panel";
import { Comments } from "./comments";
import { LikeButton } from "./like-button";
import { PickButton, ProfileFeatureButtons } from "./owner-tools";
import { HidePostButton } from "./hide-post-button";
import { ModerationNotice } from "./moderation-notice";
import { PhotoViewer } from "./photo-viewer";
import { RemoveCreditButton } from "./remove-credit-button";
import { RepublishButton } from "./republish-button";
import { ReportButton } from "./report-button";
import { SaveButton } from "./save-button";
import { WatermarkCheck } from "./watermark-check";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

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

// S-06 / S-07 게시물 상세: 사진 뷰어 · 정보 · 반응(좋아요 · 저장 · 공유) · 크레딧 · 태그 · 촬영 정보 · 댓글 · 신고 · 소명 · 연관 게시물
export default async function PostPage({ params }: PageProps<"/p/[id]">) {
  const [post, viewer] = await Promise.all([getPost((await params).id), getViewer()]);
  // 없는 글 · 볼 수 없는 글은 같은 화면 (존재 여부를 드러내지 않음)
  if (!post || post.photos.length === 0) notFound();

  const isAuthor = viewer?.id === post.author_id;
  const isAdmin = viewer?.profile?.role === "admin";
  const member = viewer?.profile ? viewer : null;
  const published = post.status === "published";
  const canHide = published && (isAuthor || isAdmin);
  // 컬렉션에 담기: 내 글 · 내가 크레딧으로 승인된 글
  const canCollect = member !== null && (isAuthor || post.credits.some((c) => c.member_id === member.id && c.status === "approved"));
  // 저장은 게시된 글만
  const canSave = member !== null && published;
  // 미가입 크레딧 중 내가 이미 연결을 요청한 것
  const externalIds = post.credits.filter((c) => c.status === "external").map((c) => c.id);
  // 연관 게시물 (S-06 ⑨): 같은 캐릭터 · 행사 · 작품 → 같은 업로더 순, 최대 8개
  const relatedTagIds = ["character", "event", "work"].flatMap((kind) => post.tags.filter((t) => t.kind === kind).map((t) => t.id));
  const feedFilter = { year: null, category: null, query: null, limit: 9 } as const;
  const none = Promise.resolve({ data: null });

  // 서로 기다릴 필요가 없는 조회는 한 번에 (RLS가 각자 볼 수 있는 것만 돌려준다)
  const supabase = await createClient();
  const [
    claimRows,
    myCollectionRows,
    holdingRows,
    likeRows,
    savedRow,
    { comments, count: commentCount },
    switches,
    followsAuthor,
    { data: authorDecor },
    { data: pickRow },
    byTags,
    byAuthor,
  ] = await Promise.all([
    member && !isAuthor && externalIds.length
      ? supabase.from("credit_claims").select("credit_id").eq("claimant_id", member.id).eq("status", "open").in("credit_id", externalIds)
      : none,
    canCollect ? supabase.from("collections").select("id, title").eq("owner_id", member!.id).order("updated_at", { ascending: false }).limit(100) : none,
    canCollect ? supabase.from("collection_posts").select("collection_id").eq("post_id", post.id) : none,
    // 좋아요 수 · 내가 눌렀는지 (볼 수 있는 글만)
    supabase.rpc("post_like_stats", { ids: [post.id] }),
    canSave ? supabase.from("bookmarks").select("post_id").eq("user_id", member!.id).eq("post_id", post.id).maybeSingle() : none,
    getComments(post.id),
    getSiteSwitches(),
    // 댓글 설정이 '팔로워만'이면 내가 업로더를 팔로우하는지
    post.comment_policy === "followers" && member && !isAuthor
      ? getFollowedMembers(member.id).then((list) => list.some((m) => m.id === post.author_id))
      : Promise.resolve(true),
    isAuthor ? supabase.from("profiles").select("cover_post_id, pinned_post_ids").eq("id", post.author_id).maybeSingle() : none,
    isAdmin ? supabase.from("daily_picks").select("post_id").eq("post_id", post.id).eq("pick_date", todayKst()).maybeSingle() : none,
    published && relatedTagIds.length ? loadFeed({ ...feedFilter, tagIds: relatedTagIds }) : Promise.resolve([]),
    published ? loadFeed({ ...feedFilter, authorId: post.author_id }) : Promise.resolve([]),
  ]);

  const claimed = new Set((claimRows.data ?? []).map((row) => row.credit_id));
  const holding = new Set((holdingRows.data ?? []).map((h) => h.collection_id));
  const myCollections = (myCollectionRows.data ?? []).map((c) => ({ id: c.id, title: c.title, has: holding.has(c.id) }));
  const likeStats = likeRows.data?.[0] ?? null;
  const saved = Boolean(savedRow.data);
  const pickedToday = Boolean(pickRow);
  const related = [...new Map([...byTags, ...byAuthor].filter((p) => p.id !== post.id).map((p) => [p.id, p])).values()].slice(0, 8);

  // 댓글: 게시된 글 · 정지 · 읽기 전용이 아닐 때 쓸 수 있다 (DB가 다시 막는다). 작성자 · 운영자는 댓글 설정과 상관없이 단다.
  const commentsClosed =
    !published || post.held_at
      ? "게시된 글에만 댓글을 달 수 있어요."
      : !isAuthor && !isAdmin && post.comment_policy === "off"
        ? "업로더가 댓글을 껐어요."
        : !isAuthor && !isAdmin && !followsAuthor
          ? "업로더를 팔로우한 회원만 댓글을 달 수 있어요."
          : viewer?.restriction
            ? "이용이 제한된 기간이라 댓글을 달 수 없어요."
            : switches.readOnly && !isAdmin
              ? "지금은 보기만 할 수 있어요."
              : null;

  // 승인됐거나 외부 표기인 크레딧만 공개. 승인 대기는 작성자 · 당사자에게만 흐리게.
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
          canLike={Boolean(viewer?.profile) && post.status === "published" && !post.held_at}
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
            {isAuthor && (post.visibility !== "public" || post.scheduled_at || post.comment_policy !== "everyone") && (
              <p className="flex flex-wrap gap-1.5 text-[11px]">
                {post.visibility !== "public" && (
                  <span className="rounded-full border border-line px-2 py-0.5">{VISIBILITY_LABEL[post.visibility].title} 공개</span>
                )}
                {post.scheduled_at && Date.parse(post.scheduled_at) > Date.parse(new Date().toISOString()) && (
                  <span className="rounded-full border border-amber-400/60 px-2 py-0.5 text-amber-200">
                    예약 {dateTimeFormat.format(new Date(post.scheduled_at))}
                  </span>
                )}
                {post.comment_policy !== "everyone" && (
                  <span className="rounded-full border border-line px-2 py-0.5">{COMMENT_POLICY_LABEL[post.comment_policy]}</span>
                )}
              </p>
            )}
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

          {post.exif && (
            <p className="flex items-start gap-1.5 text-xs text-quiet">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <circle cx="12" cy="13.5" r="3.5" />
                <path d="M8 7l1.5-3h5L16 7" />
              </svg>
              <span>
                <span className="sr-only">촬영 정보: </span>
                {post.exif}
              </span>
            </p>
          )}

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
                    <span className="w-12 shrink-0 text-quiet">{CREDIT_ROLE_LABEL[c.role]}</span>
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
          {isAuthor && post.status === "published" && (
            <ProfileFeatureButtons postId={post.id} isCover={authorDecor?.cover_post_id === post.id} isPinned={(authorDecor?.pinned_post_ids ?? []).includes(post.id)} />
          )}
          {isAdmin && post.status === "published" && post.visibility === "public" && <PickButton postId={post.id} picked={pickedToday} />}
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

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-12">
          <h2 id="related-heading" className="mb-3 px-4 text-lg font-semibold md:px-0">
            연관 게시물
          </h2>
          <PhotoFeed items={related} empty="" />
        </section>
      )}
    </article>
  );
}
