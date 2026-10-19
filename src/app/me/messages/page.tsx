import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "메시지", robots: { index: false } };

// S-16 메시지 목록: 전체 · 섭외 · 메시지 요청

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const TABS = { all: "전체", casting: "섭외", requests: "메시지 요청" } as const;
type Tab = keyof typeof TABS;

export default async function MessagesPage({ searchParams }: PageProps<"/me/messages">) {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/messages"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/messages"));
  const params = await searchParams;
  const tab: Tab = params.tab === "casting" || params.tab === "requests" ? params.tab : "all";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_threads");
  if (error) throw error;
  const requests = data.filter((t) => t.my_status === "request");
  const threads =
    tab === "requests" ? requests : data.filter((t) => t.my_status !== "request" && t.my_status !== "declined" && (tab === "all" || t.kind === "casting"));

  return (
    <div className="mx-auto max-w-xl md:max-w-2xl px-4 pt-8 pb-16 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">메시지</h1>
        <Link href="/settings#messages" className="text-sm text-quiet hover:underline">
          메시지 설정
        </Link>
      </div>
      <nav aria-label="메시지 보기" className="mt-5 flex gap-2 text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={t === "all" ? "/me/messages" : `/me/messages?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            {TABS[t]}
            {t === "requests" && requests.length ? ` ${requests.length}` : ""}
          </Link>
        ))}
      </nav>
      {tab === "requests" && (
        <p className="mt-3 text-xs leading-relaxed text-quiet">
          내가 팔로우하지 않는 사람이 보낸 대화예요. 수락하기 전에는 상대가 읽음 여부를 알 수 없고, 링크는 눌리지 않아요.
        </p>
      )}

      {threads.length === 0 ? (
        <EmptyState className="mt-4" text={tab === "requests" ? "받은 요청이 없어요." : "아직 대화가 없어요. 프로필의 '메시지'나 섭외 게시판 지원으로 시작해요."} />
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {threads.map((t) => (
            <li key={t.thread_id}>
              <Link href={`/me/messages/${t.thread_id}`} className={`flex items-center gap-3 px-2 py-3 hover:bg-surface ${t.unread ? "bg-accent/5" : ""}`}>
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slot font-semibold text-quiet">
                  {t.other_name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className="truncate font-semibold">@{t.other_handle}</span>
                    {t.kind === "casting" && <span className="shrink-0 rounded border border-line px-1 text-[10px] text-quiet">섭외</span>}
                    {t.closed && <span className="shrink-0 text-[10px] text-quiet">종료</span>}
                  </span>
                  <span className="block truncate text-sm text-quiet">
                    {t.last_sender === viewer.id ? "나: " : ""}
                    {t.last_body}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-quiet">
                  {timeFormat.format(new Date(t.last_message_at))}
                  {t.unread > 0 && (
                    <span className="min-w-5 rounded-full bg-accent px-1.5 text-center font-bold text-on-accent">
                      {t.unread > 99 ? "99+" : t.unread}
                      <span className="sr-only">개 안 읽음</span>
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
