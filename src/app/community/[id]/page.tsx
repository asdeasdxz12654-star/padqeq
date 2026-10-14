import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { BOARD_LABEL, CASTING_KIND_LABEL, TERMS_LABEL } from "@/lib/boards/labels";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { getSiteSwitches } from "@/lib/support/switches";
import { ShareButton } from "@/components/share-button";
import { AdultConfirm } from "../adult-confirm";
import { CastingApply, PostActions, Replies, type ReplyView } from "./post-interactions";

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

const getBoardPost = cache(async (id: string) => {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_posts")
    .select(
      "id, board, title, body, region, casting_kind, casting_terms, shoot_on, closed_at, hidden_at, edited_at, created_at, author_id, author:profiles!board_posts_author_id_fkey(handle, display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export async function generateMetadata({ params }: PageProps<"/community/[id]">): Promise<Metadata> {
  const post = await getBoardPost((await params).id);
  return { title: post ? post.title : "커뮤니티" };
}

export default async function BoardPostPage({ params }: PageProps<"/community/[id]">) {
  const post = await getBoardPost((await params).id);
  if (!post || !post.author) notFound();
  const viewer = await getViewer();
  const supabase = await createClient();
  const isCasting = post.board === "casting";
  const mine = viewer?.id === post.author_id;

  const [{ data: replyRows }, switches, adult] = await Promise.all([
    isCasting
      ? Promise.resolve({ data: [] })
      : supabase
          .from("board_replies")
          .select("id, body, hidden_at, edited_at, created_at, author:profiles!board_replies_author_id_fkey(id, handle)")
          .eq("board_post_id", post.id)
          .order("created_at")
          .limit(500),
    getSiteSwitches(),
    viewer?.profile && isCasting && !mine ? supabase.rpc("am_i_adult").then((r) => Boolean(r.data)) : Promise.resolve(false),
  ]);
  const replies: ReplyView[] = (replyRows ?? []).flatMap((r) =>
    r.author ? [{ id: r.id, body: r.body, hidden: r.hidden_at !== null, edited: r.edited_at !== null, createdAt: r.created_at, author: r.author }] : [],
  );
  const closedReason = !viewer?.profile
    ? null
    : post.closed_at
      ? "마감된 글이에요."
      : viewer.restriction
        ? "이용이 제한된 기간이라 답글을 달 수 없어요."
        : switches.readOnly && viewer.profile.role !== "admin"
          ? "지금은 보기만 할 수 있어요."
          : null;

  return (
    <article className="mx-auto max-w-2xl px-4 pt-8 pb-16 md:px-6">
      <Link href={`/community?board=${post.board}`} className="text-sm text-quiet hover:underline">
        ‹ {BOARD_LABEL[post.board].title}
      </Link>
      {post.hidden_at && (
        <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          운영 정책에 따라 가려진 글이에요. 다른 사람에게는 보이지 않아요.
        </p>
      )}
      <header className="mt-4 flex flex-col gap-2">
        <p className="flex flex-wrap gap-1.5 text-xs text-quiet">
          {post.closed_at && <span className="rounded border border-line px-1.5 py-0.5">마감</span>}
          {post.region && <span className="rounded border border-line px-1.5 py-0.5">{post.region}</span>}
          {post.casting_kind && <span className="rounded border border-line px-1.5 py-0.5">{CASTING_KIND_LABEL[post.casting_kind]}</span>}
          {post.casting_terms && <span className="rounded border border-line px-1.5 py-0.5">{TERMS_LABEL[post.casting_terms]}</span>}
          {post.shoot_on && <span className="rounded border border-line px-1.5 py-0.5">촬영 {post.shoot_on.replaceAll("-", ".")}</span>}
        </p>
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <p className="text-sm">
          <Link href={profileHref(post.author.handle)} className="font-semibold hover:underline">
            @{post.author.handle}
          </Link>
          <span className="text-quiet">
            {" "}
            · {timeFormat.format(new Date(post.created_at))}
            {post.edited_at && " · 수정됨"}
          </span>
        </p>
      </header>
      <div className="mt-6 text-[15px] leading-relaxed break-words whitespace-pre-line">{post.body}</div>

      {!post.hidden_at && (
        <div className="mt-6">
          <ShareButton path={`/community/${post.id}`} title={post.title} />
        </div>
      )}

      <div className="mt-6">
        <PostActions id={post.id} mine={mine} closed={post.closed_at !== null} isCasting={isCasting} canReport={Boolean(viewer?.profile) && !mine} />
      </div>

      {isCasting && !mine && (
        <section aria-label="지원" className="mt-8">
          {!viewer?.profile ? (
            <Link href={`/login?next=${encodeURIComponent(`/community/${post.id}`)}`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-on-accent">
              로그인하고 지원하기
            </Link>
          ) : post.closed_at ? (
            <p className="text-sm text-quiet">마감된 글이에요.</p>
          ) : closedReason ? (
            <p className="text-sm text-quiet">{closedReason}</p>
          ) : adult ? (
            <CastingApply postId={post.id} recipient={post.author_id} />
          ) : (
            <AdultConfirm reason="섭외 지원은 만 19세 이상끼리만 할 수 있어요." />
          )}
        </section>
      )}

      {!isCasting && (
        <div className="mt-10">
          <Replies
            postId={post.id}
            replies={replies}
            viewerId={viewer?.profile ? viewer.id : null}
            postAuthorId={post.author_id}
            canWrite={Boolean(viewer?.profile) && closedReason === null && !post.hidden_at}
            closedReason={viewer?.profile ? closedReason : null}
          />
          {!viewer && (
            <Link href={`/login?next=${encodeURIComponent(`/community/${post.id}`)}`} className="mt-3 inline-block text-sm text-quiet underline underline-offset-4">
              로그인하고 답글 달기
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
