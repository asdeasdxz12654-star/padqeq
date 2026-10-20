import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { CREDIT_ROLE_LABEL } from "@/lib/photos/credit-roles";
import { DAY_LIGHT_LABEL } from "@/lib/photos/day-light";
import { CATEGORY_LABEL } from "@/lib/photos/categories";
import Link from "next/link";
import { getComments } from "@/lib/comments/load";
import { getFollowedMembers } from "@/lib/follows/follows";
import { COMMENT_POLICY_LABEL, VISIBILITY_LABEL } from "@/lib/posts/audience";
import { loadFeed } from "@/lib/posts/feed";
import { getPost } from "@/lib/posts/get-post";
import { getSiteSwitches } from "@/lib/support/switches";
import { todayKst } from "@/lib/auth/signup-input";
import { Avatar } from "@/components/avatar";
import { profileHref } from "@/lib/profiles/profile-href";
import { TagChip } from "@/components/tag-chip";
import { createClient } from "@/lib/supabase/server";
import { ClaimCreditButton } from "./claim-credit-button";
import { PhotoFeed } from "@/components/photo-feed";
import { ShareButton } from "@/components/share-button";
import { BuryCapsule } from "./bury-capsule";
import { Comments } from "./comments";
import { LikeButton } from "./like-button";
import { PickButton, ProfileFeatureButtons } from "./owner-tools";
import { DeletePostButton } from "./delete-post-button";
import { HidePostButton } from "./hide-post-button";
import { RestorePostButton } from "./restore-post-button";
import { ModerationNotice } from "./moderation-notice";
import { PhotoViewer } from "./photo-viewer";
import { StageSwitch, StoryView } from "./story-view";
import { Veil } from "@/components/veil";
import { VEIL_LABEL, veilFor } from "@/lib/posts/veil-reasons";
import { RemoveCreditButton } from "./remove-credit-button";
import { RepublishButton } from "./republish-button";
import { ReportButton } from "./report-button";
import { SaveButton } from "./save-button";
import { WatermarkCheck } from "./watermark-check";
import { FollowButton } from "@/components/follow-button";
import { MenuGroup, MoreMenu } from "./more-menu";
import { type PhotoBack, PhotoFlip } from "./photo-flip";
import { KST } from "@/lib/format/kst";

const dateFormat = KST.date;
const dateTimeFormat = KST.monthDayTime;


// S-06 / S-07 게시물 상세: 사진 뷰어 · 정보 · 반응(좋아요 · 저장 · 공유) · 크레딧 · 태그 · 촬영 정보 · 댓글 · 신고 · 소명 · 연관 게시물
export async function PostDetail({ id }: { id: string }) {
  const [post, viewer] = await Promise.all([getPost(id), getViewer()]);
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
    // 내가 업로더를 팔로우하는지 (작가 줄의 팔로우 버튼 · '팔로워만' 댓글 설정)
    member && !isAuthor ? getFollowedMembers(member.id).then((list) => list.some((m) => m.id === post.author_id)) : Promise.resolve(false),
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
        : !isAuthor && !isAdmin && post.comment_policy === "followers" && !followsAuthor
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

  // 사진 뒷면: 이미 있는 정보로 (촬영일 · 장소 · 행사 태그 · 설명 · 함께 만든 사람 · 촬영 정보)
  const back: PhotoBack = {
    date: post.shot_on ? post.shot_on.replaceAll("-", ". ") : `${post.shot_year}년`,
    places: post.tags.filter((t) => t.kind === "place" || t.kind === "event").map((t) => t.name),
    memo: post.body ? post.body.slice(0, 280) : post.title,
    photoMemos: post.photoMemos,
    people: credits.filter((c) => c.status !== "pending").map((c) => ({ role: CREDIT_ROLE_LABEL[c.role], name: c.member ? `@${c.member.handle}` : (c.external_label ?? "") })),
    exif: [post.light && DAY_LIGHT_LABEL[post.light], post.exif].filter(Boolean).join(" · ") || null,
  };

  return (
    <article className="mx-auto max-w-[1440px] px-0 pt-4 pb-16 md:px-6 md:pt-6">
      {/* 작성자에게는 조치 안내 · 소명, 운영자에게는 상태만 */}
      {isAuthor && (post.removed_at || (post.status === "published" && post.held_at)) ? (
        <ModerationNotice postId={post.id} removed={Boolean(post.removed_at)} actionAt={(post.removed_at ?? post.held_at)!} />
      ) : post.status === "published" && post.held_at ? (
        <p className="mx-4 mb-4 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn md:mx-0">
          신고로 임시 비공개 중이에요. 운영자가 확인할 때까지 다른 사람에게는 보이지 않아요.
        </p>
      ) : null}
      {/* 작성자가 지운 글: 30일 안에는 되살릴 수 있다 (작성자에게만 보인다) */}
      {post.trashed_at && post.trashed_by_author && isAuthor && (
        <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger md:mx-0">
          <p>지운 글이에요. {dateFormat.format(new Date(Date.parse(post.trashed_at) + 30 * 86_400_000))}에 사진까지 영구 삭제돼요.</p>
          <RestorePostButton postId={post.id} />
        </div>
      )}
      {post.status !== "published" && !(isAuthor && post.removed_at) && !post.trashed_at && (
        <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm text-quiet md:mx-0">
          <p>
            {post.status === "draft"
              ? "아직 게시하지 않은 초안이에요."
              : post.removed_at
                ? "운영자가 게시를 중단한 글이에요."
                : "숨긴 글이에요. 다른 사람에게는 보이지 않지만 사진은 그대로 있어요."}
          </p>
          {/* 내가 숨긴 글은 다시 게시할 수 있다 (운영자가 중단한 글은 소명으로만) */}
          {isAuthor && post.status === "hidden" && !post.removed_at && <RepublishButton postId={post.id} />}
        </div>
      )}

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-8">
        {/* 사진 무대: 테마와 상관없이 어두운 바탕 (몰입 보기) */}
        <div className="stage-dark flex flex-col gap-3 py-3 md:rounded-2xl md:p-5">
          {/* 가림 표시: 내 글이거나 '바로 보기'를 켰으면 가리지 않는다 */}
          <PhotoFlip back={back}>
            <Veil postId={post.id} reason={veilFor(post.veil, isAuthor || Boolean(viewer?.showVeiled))} variant="full">
              {/* 3장 이상이면 세로로 이어 보기도 고를 수 있다 */}
              <StageSwitch
                count={post.photos.length}
                single={
                  <PhotoViewer
                    postId={post.id}
                    initialPhotos={post.photos}
                    watermark={viewer?.profile ? `@${viewer.profile.handle}` : null}
                    canLike={Boolean(viewer?.profile) && post.status === "published" && !post.held_at}
                  />
                }
                story={
                  <StoryView postId={post.id} initialPhotos={post.photos} watermark={viewer?.profile ? `@${viewer.profile.handle}` : null} memos={post.photoMemos} />
                }
              />
            </Veil>
          </PhotoFlip>
          {/* 촬영 데이터 줄: 카메라 화면처럼 사진 바로 아래 한 줄 */}
          {(post.exif || post.light) && (
            <p className="px-4 text-center font-mono text-xs leading-relaxed tracking-wide text-quiet">
              <span className="sr-only">촬영 정보: </span>
              {post.light && (
                <span className="font-sans font-semibold text-text">
                  <span aria-hidden="true" className="mr-1 inline-block size-2 rounded-full bg-sun align-middle" />
                  {DAY_LIGHT_LABEL[post.light]}
                  {post.exif && <span className="font-normal text-quiet"> · </span>}
                </span>
              )}
              {!post.exif ? null : post.camera && post.exif.startsWith(post.camera) ? (
                <>
                  <Link prefetch={false} href={`/camera?name=${encodeURIComponent(post.camera)}`} className="underline decoration-dotted underline-offset-4 hover:text-text">
                    {post.camera}
                  </Link>
                  {post.exif.slice(post.camera.length)}
                </>
              ) : (
                post.exif
              )}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-5 px-4 md:sticky md:top-20 md:mt-0 md:px-0">
          <header className="flex flex-col gap-3">
            {/* 작가 줄 */}
            <div className="flex items-center gap-3">
              <Link href={profileHref(post.author.handle)} aria-label={`@${post.author.handle} 프로필`} className="shrink-0">
                <Avatar avatarKey={post.author.avatar_key} size={44} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={profileHref(post.author.handle)} className="block truncate font-bold hover:underline">
                  {post.author.display_name}
                </Link>
                <p className="truncate text-sm text-quiet">@{post.author.handle}</p>
              </div>
              {member && !isAuthor && <FollowButton target={{ kind: "member", id: post.author_id }} initial={followsAuthor} />}
            </div>

            <h1 className="text-2xl leading-snug font-bold">{post.title}</h1>
            <p className="text-sm text-quiet">
              {CATEGORY_LABEL[post.category]} · 촬영 {post.shot_on ? dateFormat.format(new Date(post.shot_on)) : `${post.shot_year}년`}
              {post.published_at && ` · 게시 ${dateFormat.format(new Date(post.published_at))}`}
              {post.photos.length > 1 && ` · ${post.photos.length}장`}
            </p>
            {isAuthor && (post.visibility !== "public" || post.scheduled_at || post.comment_policy !== "everyone") && (
              <p className="flex flex-wrap gap-1.5 text-[11px]">
                {post.visibility !== "public" && (
                  <span className="rounded-full border border-line px-2 py-0.5">{VISIBILITY_LABEL[post.visibility].title} 공개</span>
                )}
                {post.scheduled_at && Date.parse(post.scheduled_at) > Date.parse(new Date().toISOString()) && (
                  <span className="rounded-full border border-warn-line px-2 py-0.5 text-warn">
                    예약 {dateTimeFormat.format(new Date(post.scheduled_at))}
                  </span>
                )}
                {post.comment_policy !== "everyone" && (
                  <span className="rounded-full border border-line px-2 py-0.5">{COMMENT_POLICY_LABEL[post.comment_policy]}</span>
                )}
              </p>
            )}
            {post.veil && (
              <p className="text-xs text-quiet">
                <span className="rounded-full border border-line px-2 py-0.5">가림 표시 · {VEIL_LABEL[post.veil].title}</span>
                {isAuthor && post.veil_by_staff && <span> 운영자가 붙였어요</span>}
              </p>
            )}

            {/* 같은 일은 같은 자리: 좋아요 · 저장 · 공유 · ⋯ */}
            <div className="flex flex-wrap items-center gap-2">
              {post.status === "published" && !post.held_at && (
                <>
                  <LikeButton
                    postId={post.id}
                    initial={likeStats?.liked ?? false}
                    count={likeStats?.likes ?? 0}
                    loginHref={viewer?.profile ? null : `/login?next=${encodeURIComponent(`/p/${post.id}`)}`}
                  />
                  {canSave ? (
                    <SaveButton postId={post.id} initial={saved} collections={canCollect ? myCollections : undefined} />
                  ) : (
                    !viewer && (
                      <Link
                        href={`/login?next=${encodeURIComponent(`/p/${post.id}`)}`}
                        className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-bold text-on-accent"
                      >
                        저장
                      </Link>
                    )
                  )}
                  <ShareButton path={`/p/${post.id}`} title={post.title} />
                </>
              )}
              {/* 작가에게는 가장 자주 쓰는 고치기를 ⋯ 밖에 (나머지 작가 도구는 ⋯ 안) */}
              {isAuthor && !post.trashed_at && (
                <Link href={`/p/${post.id}/edit`} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-quiet">
                  고치기
                </Link>
              )}
              <div className="ml-auto">
                <MoreMenu>
                  {!isAuthor && (
                    <MenuGroup title="이 게시물">
                      {viewer?.profile ? (
                        <ReportButton postId={post.id} photoCount={post.photos.length} />
                      ) : (
                        <Link href={`/login?next=${encodeURIComponent(`/p/${post.id}`)}`} className="text-sm underline underline-offset-4">
                          로그인하고 신고
                        </Link>
                      )}
                    </MenuGroup>
                  )}
                  {canCollect && post.status === "published" && (
                    <MenuGroup title="미래의 나에게">
                      <BuryCapsule postId={post.id} />
                    </MenuGroup>
                  )}
                  {isAuthor && !post.trashed_at && (
                    <MenuGroup title="작가 메뉴">
                      {post.status === "published" && (
                        <ProfileFeatureButtons postId={post.id} isCover={authorDecor?.cover_post_id === post.id} isPinned={(authorDecor?.pinned_post_ids ?? []).includes(post.id)} />
                      )}
                      {canHide && <HidePostButton postId={post.id} />}
                      <DeletePostButton postId={post.id} credited={post.credits.some((c) => c.status === "approved" && c.member_id !== null)} />
                    </MenuGroup>
                  )}
                  {isAdmin && (
                    <MenuGroup title="운영 메뉴">
                      {post.status === "published" && post.visibility === "public" && <PickButton postId={post.id} picked={pickedToday} />}
                      {!isAuthor && canHide && <HidePostButton postId={post.id} />}
                      <WatermarkCheck postId={post.id} />
                    </MenuGroup>
                  )}
                </MoreMenu>
              </div>
            </div>
          </header>

          {post.body && <p className="text-[15px] leading-relaxed whitespace-pre-line">{post.body}</p>}

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
            <section aria-labelledby="credits-heading" className="flex flex-col gap-2 border-t border-line pt-4">
              <h2 id="credits-heading" className="text-sm font-bold">
                함께 만든 사람
              </h2>
              <ul className="flex flex-col gap-2 text-sm">
                {credits.map((c) => (
                  <li key={c.id} className={`grid grid-cols-[4.5rem_1fr] items-baseline gap-x-3 ${c.status === "pending" ? "opacity-50" : ""}`}>
                    <span className="text-quiet">{CREDIT_ROLE_LABEL[c.role]}</span>
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {c.member ? (
                        <Link href={profileHref(c.member.handle)} className="font-bold hover:underline">
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
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs leading-relaxed text-quiet">© @{post.author.handle} · 무단 전재 · 다운로드 · AI 학습 이용 금지</p>

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
          <h2 id="related-heading" className="mb-3 px-4 text-lg font-bold md:px-0">
            이어서 볼 사진
          </h2>
          <PhotoFeed items={related} empty="" />
        </section>
      )}
    </article>
  );
}
