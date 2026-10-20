import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EventForm } from "@/components/event-form";
import { withNext } from "@/lib/auth/next-path";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { formatRange } from "@/lib/events/calendar";
import { createClient } from "@/lib/supabase/server";
import { proposeEvent } from "../actions";

export const metadata: Metadata = { title: "행사 알리기", robots: { index: false } };

const STATUS_LABEL = { proposed: "검토 중", official: "등록됨", rejected: "등록 안 함" } as const;

// S-12 ① 행사 알리기 (글쓰기 작성 목록): 회원은 행사 등록을 제안하고, 운영자가 확인해 등록한다.
// 장소 태그는 운영자가 승인할 때 잇는다 (회원에게는 고르기 어렵다).
export default async function ProposeEventPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/events/propose"));
  if (!viewer.profile) redirect(withNext("/welcome", "/events/propose"));

  const supabase = await createClient();
  const { data: mine } = await supabase
    .from("events")
    .select("id, name, starts_on, ends_on, status, review_note")
    .eq("proposed_by", viewer.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const today = todayKst();

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 pb-16 md:px-6">
      <Link href="/events" className="text-sm text-quiet hover:underline">
        ‹ 행사 캘린더
      </Link>
      <h1 className="mt-4 text-2xl font-bold">행사 알리기</h1>
      <p className="mt-2 text-sm leading-relaxed text-quiet">
        캘린더에 없는 행사를 알려 주세요. 운영자가 확인한 뒤 등록하고 알려 드려요. 검토 중인 제안은 5건까지예요.
      </p>
      <div className="mt-6">
        <EventForm
          initial={{ name: "", startsOn: today, endsOn: today, venue: "", region: "서울", url: "", description: "" }}
          submit={proposeEvent}
          submitLabel="제안하기"
          singleDayFirst
          doneMessage="제안했어요. 검토 결과를 알림으로 알려 드릴게요."
        />
      </div>

      {mine && mine.length > 0 && (
        <section aria-labelledby="mine-heading" className="mt-10">
          <h2 id="mine-heading" className="mb-3 text-lg font-semibold">
            내 제안
          </h2>
          <ul className="flex flex-col gap-2">
            {mine.map((e) => (
              <li key={e.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={e.status === "official" ? "text-ok" : e.status === "rejected" ? "text-quiet" : "text-warn"}>
                    {STATUS_LABEL[e.status]}
                  </span>
                  <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                    {e.name}
                  </Link>
                  <span className="text-xs text-quiet">{formatRange(e.starts_on, e.ends_on)}</span>
                </p>
                {e.review_note && <p className="mt-1 text-xs text-quiet">사유: {e.review_note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
