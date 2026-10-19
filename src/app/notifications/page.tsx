import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { type CreditRequest, CreditRequests } from "@/app/me/credit-requests";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import {
  NOTIFICATION_GROUP_LABEL,
  type NotificationGroup,
  describeNotification,
  notificationGroup,
  timeBucket,
} from "@/lib/notifications/describe";
import { createClient } from "@/lib/supabase/server";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "알림", robots: { index: false } };

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
const GROUPS = Object.keys(NOTIFICATION_GROUP_LABEL) as NotificationGroup[];
const isGroup = (v: unknown): v is NotificationGroup => typeof v === "string" && (GROUPS as string[]).includes(v);

// 알림 (S-10 ⑤⑥, 사이트 안에서만). 최근 100개 · 종류 필터 · 오늘 · 이번 주 · 이전. 읽은 알림은 90일 뒤 정리된다.
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/notifications"));
  if (!viewer.profile) redirect(withNext("/welcome", "/notifications"));
  const params = await searchParams;
  const group = isGroup(params.f) ? params.f : null;

  const supabase = await createClient();
  // 상대 · 게시물은 지금 내가 볼 수 있을 때만 붙는다 (RLS)
  const [{ data, error }, pendingCredits, openClaims] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id, kind, created_at, read_at, actor:profiles!notifications_actor_id_fkey(handle), post:posts!notifications_post_id_fkey(id, title), event:events!notifications_event_id_fkey(id, name), board:board_posts!notifications_board_post_id_fkey(id, title), thread_id",
      )
      .eq("recipient_id", viewer.id)
      .order("id", { ascending: false })
      .limit(100),
    // 받은 요청: 나를 태그한 크레딧 · 내 글에 온 크레딧 연결 요청 (RLS: 작성자 · 요청자만)
    // 크레딧 요청은 알림 화면에서 바로 승인 · 거절한다 (예전에는 마이로 한 번 더 갔다)
    supabase
      .from("credits")
      .select("id, role, post:posts!credits_post_id_fkey(id, title, author_id, author:profiles!posts_author_id_fkey(handle))")
      .eq("member_id", viewer.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("credit_claims").select("id", { count: "exact", head: true }).eq("status", "open").neq("claimant_id", viewer.id),
  ]);
  if (error) throw error;
  const creditRequests: CreditRequest[] = (pendingCredits.data ?? []).flatMap((c) =>
    c.post && c.post.author_id !== viewer.id
      ? [{ id: c.id, role: c.role, postId: c.post.id, postTitle: c.post.title, uploader: c.post.author?.handle ?? "" }]
      : [],
  );
  const claimCount = openClaims.count ?? 0;

  const all = data.map((n) => ({
    ...n,
    group: notificationGroup(n.kind),
    bucket: timeBucket(n.created_at),
    ...describeNotification({ kind: n.kind, actorHandle: n.actor?.handle ?? null, post: n.post, event: n.event, board: n.board, threadId: n.thread_id }),
  }));
  // 읽음 처리는 필터와 상관없이 가장 최근 안 읽은 것까지
  const newestUnread = all.find((n) => !n.read_at)?.id;
  const items = group ? all.filter((n) => n.group === group) : all;
  const buckets = (["오늘", "이번 주", "이전"] as const).map((b) => ({ label: b, items: items.filter((n) => n.bucket === b) })).filter((b) => b.items.length);
  const chip = "rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg";

  return (
    <div className="mx-auto max-w-xl md:max-w-2xl px-4 pt-10 pb-16 md:px-6">
      <h1 className="mb-4 text-2xl font-bold">알림</h1>
      {creditRequests.length > 0 && (
        <div className="mb-6 rounded-2xl border border-accent/40 bg-accent-soft/40 px-4 pb-4 [&>section]:mt-3">
          <CreditRequests requests={creditRequests} />
        </div>
      )}
      {claimCount > 0 && (
        <Link
          href="/me#requests"
          className="mb-5 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft/40 px-4 py-3 hover:border-accent"
        >
          <span>
            <span className="block font-bold">크레딧 연결 요청 {claimCount}건</span>
            <span className="block text-xs text-quiet">내 글의 미가입 크레딧이 자기라는 요청이에요. 마이페이지에서 확인해 주세요</span>
          </span>
          <span aria-hidden="true" className="text-quiet">
            ›
          </span>
        </Link>
      )}
      {newestUnread !== undefined && <MarkRead upToId={newestUnread} />}
      <nav aria-label="알림 종류" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
        <Link href="/notifications" aria-current={!group ? "page" : undefined} className={`${chip} shrink-0`}>
          전체
        </Link>
        {GROUPS.map((g) => (
          <Link key={g} href={`/notifications?f=${g}`} aria-current={group === g ? "page" : undefined} className={`${chip} shrink-0`}>
            {NOTIFICATION_GROUP_LABEL[g]}
          </Link>
        ))}
      </nav>

      {buckets.length === 0 ? (
        <EmptyState text={group ? "이 종류의 알림이 없어요." : "아직 알림이 없어요. 크레딧 · 댓글 · 좋아요 소식이 여기 모여요."} />
      ) : (
        buckets.map((b) => (
          <section key={b.label} aria-labelledby={`bucket-${b.label}`} className="mb-6">
            <h2 id={`bucket-${b.label}`} className="mb-2 text-sm font-semibold text-quiet">
              {b.label}
            </h2>
            <ul className="flex flex-col gap-2">
              {b.items.map((n) => {
                const body = (
                  <>
                    <span className="block">{n.text}</span>
                    {n.post && <span className="mt-1 block truncate text-xs text-quiet">{n.post.title}</span>}
                    {n.event && <span className="mt-1 block truncate text-xs text-quiet">{n.event.name}</span>}
                    {n.board && <span className="mt-1 block truncate text-xs text-quiet">{n.board.title}</span>}
                    <time dateTime={n.created_at} className="mt-1 block text-xs text-quiet">
                      {timeFormat.format(new Date(n.created_at))}
                    </time>
                  </>
                );
                const box = `block rounded-xl border p-3 text-sm leading-relaxed ${n.read_at ? "border-line" : "border-accent/50 bg-accent/5"}`;
                return (
                  <li key={n.id}>
                    {!n.read_at && <span className="sr-only">새 알림: </span>}
                    {n.href ? (
                      <Link href={n.href} className={`${box} hover:border-quiet`}>
                        {body}
                      </Link>
                    ) : (
                      <div className={box}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
