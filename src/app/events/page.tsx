import type { Metadata } from "next";
import Link from "next/link";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { formatRange, monthGrid, monthKey, monthRange, onDay, parseMonth, shiftMonth } from "@/lib/events/calendar";
import { attendeeCounts, listEvents, myAttendance } from "@/lib/events/load";

export const metadata: Metadata = { title: "행사 캘린더" };

// S-17 행사 캘린더: 월간 달력 + 그달 행사 목록. 참가 예정인 행사는 진하게, '참가 예정만' 보기.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const params = await searchParams;
  const today = todayKst();
  const current = parseMonth(params.month, { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const mineOnly = params.mine === "1";
  const { first, last } = monthRange(current);

  const viewer = await getViewer();
  const all = await listEvents(first, last);
  const [counts, mine] = await Promise.all([
    attendeeCounts(all.map((e) => e.id)),
    viewer?.profile ? myAttendance(viewer.id, all.map((e) => e.id)) : Promise.resolve(new Map()),
  ]);
  const events = mineOnly ? all.filter((e) => mine.has(e.id)) : all;

  const href = (month: string, mineFlag = mineOnly) => `/events?month=${month}${mineFlag ? "&mine=1" : ""}`;
  const key = monthKey(current);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-16 md:px-6 lg:max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">행사 캘린더</h1>
        {viewer?.profile && (
          <Link href="/events/propose" className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-quiet">
            행사 제안
          </Link>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Link href={href(monthKey(shiftMonth(current, -1)))} aria-label="이전 달" className="flex size-11 items-center justify-center rounded-full border border-line">
          ‹
        </Link>
        <h2 className="text-lg font-semibold tabular-nums">
          {current.year}.{String(current.month).padStart(2, "0")}
        </h2>
        <Link href={href(monthKey(shiftMonth(current, 1)))} aria-label="다음 달" className="flex size-11 items-center justify-center rounded-full border border-line">
          ›
        </Link>
      </div>

      {viewer?.profile && (
        <nav aria-label="보기" className="mt-4 flex gap-2 text-sm">
          <Link href={href(key, false)} aria-current={!mineOnly ? "page" : undefined} className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg">
            전체
          </Link>
          <Link href={href(key, true)} aria-current={mineOnly ? "page" : undefined} className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg">
            참가 예정만
          </Link>
        </nav>
      )}

      {/* 달력: 행사가 있는 날 점, 참가 예정은 칠한다. 날짜를 누르면 목록의 그날 행사로 */}
      <table className="mt-4 w-full table-fixed border-separate border-spacing-0.5 text-center text-xs" aria-label={`${current.year}년 ${current.month}월 행사`}>
        <thead>
          <tr>
            {WEEKDAYS.map((d, i) => (
              <th key={d} scope="col" className={`py-1 font-medium ${i === 0 ? "text-red-300" : "text-quiet"}`}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(current).map((week, w) => (
            <tr key={w}>
              {week.map((day, i) => {
                if (!day) return <td key={i} />;
                const dayEvents = events.filter((e) => onDay(day, e));
                const attending = dayEvents.some((e) => mine.has(e.id));
                const label = `${Number(day.slice(8))}일${dayEvents.length ? `, 행사 ${dayEvents.length}개` : ""}`;
                const inner = (
                  <>
                    <span className={day === today ? "font-bold text-accent" : ""}>{Number(day.slice(8))}</span>
                    {dayEvents.length > 0 && (
                      <span aria-hidden="true" className={`mx-auto mt-1 block size-1.5 rounded-full ${attending ? "bg-accent" : "bg-text"}`} />
                    )}
                  </>
                );
                return (
                  <td key={i} className={`h-12 rounded-md align-top ${attending ? "bg-accent/15" : ""}`}>
                    {dayEvents.length ? (
                      <a href={`#event-${dayEvents[0]!.id}`} aria-label={label} className="block h-full pt-1.5">
                        {inner}
                      </a>
                    ) : (
                      <span aria-label={label} className="block h-full pt-1.5 text-quiet">
                        {inner}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-label="이달의 행사" className="mt-6">
        {events.length === 0 ? (
          <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">
            {mineOnly ? "이달에 참가 예정인 행사가 없어요." : "이달에 등록된 행사가 없어요."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {events.map((e) => {
              const past = e.ends_on < today;
              return (
                <li key={e.id} id={`event-${e.id}`} className="scroll-mt-20">
                  <Link href={`/events/${e.id}`} className="flex items-center gap-3 py-3 hover:text-text">
                    <span className="w-24 shrink-0 text-sm tabular-nums text-quiet">{formatRange(e.starts_on, e.ends_on)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.name}</span>
                      <span className="block truncate text-xs text-quiet">
                        {e.venue} · {e.region}
                        {counts.get(e.id) ? ` · 참가 예정 ${counts.get(e.id)}명` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${mine.has(e.id) ? "bg-accent text-on-accent" : "border border-line text-quiet"}`}>
                      {past ? "사진 보기" : mine.has(e.id) ? "참가 예정" : "자세히"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
