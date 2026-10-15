import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { Composer, MarkThreadRead, type MessageView, Messages, RequestBar, SafetyGuide, ThreadMenu } from "./thread-view";

export const metadata: Metadata = { title: "메시지", robots: { index: false } };

// S-16 대화: 상대 프로필 · 신고 · 차단 · (섭외) 안전 가이드 · 문의서 · 메시지 · 입력
export default async function ThreadPage({ params }: PageProps<"/me/messages/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", `/me/messages/${id}`));
  if (!viewer.profile) redirect(withNext("/welcome", `/me/messages/${id}`));

  const supabase = await createClient();
  const [{ data: threads, error }, { data: rows, error: messagesError }, { data: me }, { data: blockRow }] = await Promise.all([
    supabase.rpc("my_threads"),
    supabase.from("messages").select("id, sender_id, body, form, created_at").eq("thread_id", id).order("id", { ascending: false }).limit(200),
    supabase.from("thread_members").select("guide_dismissed_at").eq("thread_id", id).eq("user_id", viewer.id).maybeSingle(),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", viewer.id),
  ]);
  if (error || messagesError) throw error ?? messagesError;
  const thread = threads.find((t) => t.thread_id === id);
  if (!thread) notFound();

  const { data: boardPost } = thread.board_post_id
    ? await supabase.from("board_posts").select("id, title").eq("id", thread.board_post_id).maybeSingle()
    : { data: null };
  const messages: MessageView[] = rows
    .map((m) => ({
      id: m.id,
      mine: m.sender_id === viewer.id,
      body: m.body,
      form: m.form && typeof m.form === "object" && !Array.isArray(m.form) ? (m.form as Record<string, string>) : null,
      createdAt: m.created_at,
    }))
    .reverse();
  const blocked = (blockRow ?? []).some((b) => b.blocked_id === thread.other_id);
  const isRequest = thread.my_status === "request";

  return (
    <div className="mx-auto flex max-w-xl md:max-w-2xl flex-col gap-4 px-4 pt-6 pb-16 md:px-6">
      <MarkThreadRead threadId={id} latest={messages.at(-1)?.id ?? 0} />
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/me/messages" className="text-sm text-quiet hover:underline">
            ‹ 메시지
          </Link>
          <h1 className="mt-1 truncate text-lg font-bold">
            <Link href={profileHref(thread.other_handle)} className="hover:underline">
              @{thread.other_handle}
            </Link>
            <span className="ml-2 text-sm font-normal text-quiet">{thread.other_name}</span>
          </h1>
          {boardPost && (
            <p className="truncate text-xs text-quiet">
              섭외 ·{" "}
              <Link href={`/community/${boardPost.id}`} className="underline underline-offset-2">
                {boardPost.title}
              </Link>
            </p>
          )}
        </div>
        <ThreadMenu threadId={id} otherId={thread.other_id} blocked={blocked} />
      </header>

      {thread.kind === "casting" && !me?.guide_dismissed_at && <SafetyGuide threadId={id} />}
      <Messages messages={messages} otherReadAt={thread.other_read_at} />

      {thread.closed ? (
        <p className="rounded-xl border border-line p-3 text-center text-sm text-quiet">
          {blocked ? "차단한 상대예요. 차단을 풀면 다시 대화할 수 있어요." : "더 이상 메시지를 주고받을 수 없는 대화예요."}
        </p>
      ) : isRequest ? (
        <RequestBar threadId={id} />
      ) : viewer.restriction ? (
        <p className="text-sm text-quiet">이용이 제한된 기간이라 메시지를 보낼 수 없어요.</p>
      ) : (
        <Composer threadId={id} />
      )}
    </div>
  );
}
