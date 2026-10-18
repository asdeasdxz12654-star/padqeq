import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildPostHistory, type HistoryTone } from "@/lib/admin/post-history";
import { postStateLabel } from "@/lib/admin/post-bulk";
import { requireTopAdmin } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/ids";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { VeilForm } from "./veil-form";

export const metadata: Metadata = { title: "게시물 처리 이력" };

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
const TONE: Record<HistoryTone, string> = { normal: "bg-quiet", warn: "bg-amber-400", danger: "bg-red-400", good: "bg-emerald-400" };

// A-03 ⑧ 게시물 처리 이력: 업로드 · 게시 · 수정 · 사진 추가 · 크레딧 · 신고 · 운영 조치 · 소명 · 오늘의 픽 (새것이 위)
export default async function AdminPostHistoryPage({ params }: PageProps<"/admin/posts/[id]">) {
  await requireTopAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, title, status, visibility, created_at, published_at, updated_at, scheduled_at, held_at, removed_at, trashed_at, quarantined_at, veil, veil_by_staff, author:profiles!posts_author_id_fkey(id, handle)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  const [photos, credits, reports, appeals, picks, audit] = await Promise.all([
    supabase.from("photos").select("created_at").eq("post_id", id),
    supabase.from("credits").select("created_at, role, status, external_label, member:profiles!credits_member_id_fkey(handle)").eq("post_id", id),
    supabase.from("reports").select("created_at, resolved_at, reason, status, reporter:profiles!reports_reporter_id_fkey(handle)").eq("post_id", id),
    supabase.from("appeals").select("created_at, resolved_at, status").eq("post_id", id),
    supabase.from("daily_picks").select("pick_date").eq("post_id", id),
    supabase.rpc("admin_audit_log", { q: id, max_rows: 200 }),
  ]);
  const events = buildPostHistory({
    post,
    photos: photos.data ?? [],
    credits: (credits.data ?? []).map((c) => ({ created_at: c.created_at, role: c.role, status: c.status, handle: c.member?.handle ?? null, label: c.external_label })),
    reports: (reports.data ?? []).map((r) => ({ created_at: r.created_at, resolved_at: r.resolved_at, reason: r.reason, status: r.status, reporter: r.reporter?.handle ?? null })),
    appeals: appeals.data ?? [],
    picks: picks.data ?? [],
    audit: audit.data ?? [],
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href="/admin/posts" className="text-sm text-quiet hover:underline">
        ‹ 게시물 관리
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-quiet">처리 이력</p>
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <p className="flex flex-wrap gap-x-3 text-sm text-quiet">
          {post.author && (
            <Link href={`/admin/members/${post.author.id}`} className="hover:underline">
              @{post.author.handle}
            </Link>
          )}
          <span className="text-warn">{postStateLabel(post)}</span>
          <Link href={`/p/${post.id}`} className="underline underline-offset-2">
            게시물 보기
          </Link>
          {post.author && (
            <Link href={profileHref(post.author.handle)} className="underline underline-offset-2">
              프로필
            </Link>
          )}
        </p>
      </header>

      <section aria-labelledby="veil-heading" className="flex flex-col gap-2 rounded-xl border border-line p-4">
        <h2 id="veil-heading" className="font-semibold">
          가림 표시
        </h2>
        <p className="text-xs text-quiet">피 · 공포 분장처럼 보기 불편할 수 있는 사진을 흐리게 가려요. 성인 콘텐츠는 가림이 아니라 게시 중단 대상이에요.</p>
        <VeilForm postId={post.id} current={post.veil} byStaff={post.veil_by_staff} />
      </section>

      <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span aria-hidden="true" className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ${TONE[e.tone]}`} />
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold">{e.title}</span>
              <time dateTime={e.at} className="text-xs text-quiet">
                {timeFormat.format(new Date(e.at))}
              </time>
              {e.who && <span className="text-xs text-quiet">{e.who === "자동" ? "자동" : `@${e.who}`}</span>}
            </p>
            {e.detail && <p className="mt-0.5 text-sm break-words text-quiet">{e.detail}</p>}
          </li>
        ))}
      </ol>
      <p className="text-xs text-quiet">운영 조치 기록은 3년, 처리된 신고 · 소명은 3년 보관한 뒤 지워져요. 오늘의 픽은 그날 0시로 표시해요.</p>
    </div>
  );
}
