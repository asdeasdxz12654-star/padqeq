import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { describeNotification } from "@/lib/notifications/describe";
import { createClient } from "@/lib/supabase/server";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "알림", robots: { index: false } };

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

// 알림 (사이트 안에서만). 최근 50개. 읽은 알림은 90일 뒤 정리된다.
export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/notifications"));
  if (!viewer.profile) redirect(withNext("/welcome", "/notifications"));

  const supabase = await createClient();
  // 상대 · 게시물은 지금 내가 볼 수 있을 때만 붙는다 (RLS)
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, kind, created_at, read_at, actor:profiles!notifications_actor_id_fkey(handle), post:posts!notifications_post_id_fkey(id, title)",
    )
    .eq("recipient_id", viewer.id)
    .order("id", { ascending: false })
    .limit(50);
  if (error) throw error;

  const items = data.map((n) => ({
    ...n,
    ...describeNotification({ kind: n.kind, actorHandle: n.actor?.handle ?? null, post: n.post }),
  }));
  const newestUnread = items.find((n) => !n.read_at)?.id;

  return (
    <div className="mx-auto max-w-xl px-4 pt-10 pb-16 md:px-6">
      <h1 className="mb-6 text-2xl font-bold">알림</h1>
      {newestUnread !== undefined && <MarkRead upToId={newestUnread} />}

      {items.length === 0 ? (
        <p className="rounded-xl border border-line px-4 py-10 text-center text-sm text-quiet">아직 알림이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => {
            const body = (
              <>
                <span className="block">{n.text}</span>
                {n.post && <span className="mt-1 block truncate text-xs text-quiet">{n.post.title}</span>}
                <time dateTime={n.created_at} className="mt-1 block text-xs text-quiet">
                  {timeFormat.format(new Date(n.created_at))}
                </time>
              </>
            );
            const box = `block rounded-xl border p-3 text-sm leading-relaxed ${
              n.read_at ? "border-line" : "border-accent/50 bg-accent/5"
            }`;
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
      )}
    </div>
  );
}
