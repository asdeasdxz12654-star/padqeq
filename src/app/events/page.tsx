import type { Metadata } from "next";
import Link from "next/link";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { MapExplorer } from "@/components/map-explorer";
import type { MapPlace } from "@/components/place-map";
import { formatRange, monthGrid, monthKey, monthRange, onDay, parseMonth, REGIONS, type Region, shiftMonth } from "@/lib/events/calendar";
import { createClient } from "@/lib/supabase/server";
import { attendeeCounts, listEvents, myAttendance } from "@/lib/events/load";

export const metadata: Metadata = { title: "행사 캘린더" };

// S-17 행사 캘린더: 월간 달력 + 그달 행사 목록. 참가 예정인 행사는 진하게, '참가 예정만' 보기.
// 지도 보기: 그달 행사가 열리는 곳 (행사 태그 위치, 없으면 연결된 장소 위치). 지역으로 좁힐 수 있다.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const params = await searchParams;
  const today = todayKst();
  const current = parseMonth(params.month, { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const mineOnly = params.mine === "1";
  const mapView = params.view === "map";
  const region = typeof params.region === "string" && (REGIONS as readonly string[]).includes(params.region) ? (params.region as Region) : null;
  const { first, last } = monthRange(current);

  // 서로 기다릴 필요 없는 것은 함께 부른다 (회원 · 그달 행사 → 참가 수 · 내 참가 · 지도 위치)
  const [viewer, all] = await Promise.all([getViewer(), listEvents(first, last)]);
  const [counts, mine, allLocated] = await Promise.all([
    attendeeCounts(all.map((e) => e.id)),
    viewer?.profile ? myAttendance(viewer.id, all.map((e) => e.id)) : Promise.resolve(new Map()),
    mapView ? eventLocations(all) : Promise.resolve(null),
  ]);
  const regions = REGIONS.filter((r) => all.some((e) => e.region === r));
  const shown = (e: (typeof all)[number]) => (!mineOnly || mine.has(e.id)) && (!region || e.region === region);
  const events = all.filter(shown);
  const shownIds = new Set(events.map((e) => e.id));
  const located = allLocated && { onMap: allLocated.onMap.filter((p) => shownIds.has(p.id)), missing: allLocated.missing.filter(shown) };

  const href = (month: string, opts: { mine?: boolean; map?: boolean; region?: Region | null } = {}) => {
    const q = new URLSearchParams({ month });
    if (opts.mine ?? mineOnly) q.set("mine", "1");
    if (opts.map ?? mapView) q.set("view", "map");
    const r = opts.region === undefined ? region : opts.region;
    if (r) q.set("region", r);
    return `/events?${q}`;
  };
  const chip = "rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg";
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

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <nav aria-label="보기 방식" className="flex gap-2">
          <Link href={href(key, { map: false })} aria-current={!mapView ? "page" : undefined} className={chip}>
            달력
          </Link>
          <Link href={href(key, { map: true })} aria-current={mapView ? "page" : undefined} className={chip}>
            지도
          </Link>
        </nav>
        {viewer?.profile && (
          <nav aria-label="보기" className="flex gap-2">
            <Link href={href(key, { mine: false })} aria-current={!mineOnly ? "page" : undefined} className={chip}>
              전체
            </Link>
            <Link href={href(key, { mine: true })} aria-current={mineOnly ? "page" : undefined} className={chip}>
              참가 예정만
            </Link>
          </nav>
        )}
      </div>
      {regions.length > 1 && (
        <nav aria-label="지역" className="mt-2 flex flex-wrap gap-2 text-sm">
          <Link href={href(key, { region: null })} aria-current={!region ? "page" : undefined} className={chip}>
            모든 지역
          </Link>
          {regions.map((r) => (
            <Link key={r} href={href(key, { region: r })} aria-current={region === r ? "page" : undefined} className={chip}>
              {r}
            </Link>
          ))}
        </nav>
      )}

      {located ? (
        <div className="mt-4 flex flex-col gap-4">
          <MapExplorer
            places={located.onMap}
            focus={null}
            listTitle="이달의 행사 · 열리는 곳"
            countUnit="개"
            nearWhat="행사"
            empty={events.length === 0 ? "이달에 등록된 행사가 없어요." : "이달 행사 중 지도 위치가 정해진 행사가 없어요."}
          />
          {located.missing.length > 0 && (
            <section aria-labelledby="no-location-heading" className="text-sm">
              <h2 id="no-location-heading" className="mb-1 font-semibold">
                지도에 없는 행사 <span className="font-normal text-quiet">{located.missing.length}개</span>
              </h2>
              <p className="mb-2 text-xs text-quiet">열리는 곳의 지도 위치가 아직 없어요. 운영자가 정하면 지도에 나와요.</p>
              <ul className="flex flex-col">
                {located.missing.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}`} className="flex min-h-11 items-center gap-3 hover:underline">
                      <span className="w-24 shrink-0 tabular-nums text-quiet">{formatRange(e.starts_on, e.ends_on)}</span>
                      <span className="min-w-0 truncate">
                        {e.name} <span className="text-quiet">· {e.venue}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

/** 지도 보기: 행사 태그에 정한 위치, 없으면 연결된 장소 태그의 위치 (촬영 장소 지도와 같은 규칙) */
async function eventLocations(events: Awaited<ReturnType<typeof listEvents>>): Promise<{ onMap: MapPlace[]; missing: typeof events }> {
  const ids = [...new Set(events.flatMap((e) => [e.tag_id, e.place_tag_id]).filter((id): id is string => id !== null))];
  const supabase = await createClient();
  const { data } = ids.length
    ? await supabase.from("tags").select("id, slug, lat, lng").in("id", ids).eq("status", "official")
    : { data: [] as { id: string; slug: string; lat: number | null; lng: number | null }[] };
  const byId = new Map((data ?? []).map((t) => [t.id, t]));
  const onMap: MapPlace[] = [];
  const missing: typeof events = [];
  for (const e of events) {
    const own = e.tag_id ? byId.get(e.tag_id) : undefined;
    const place = e.place_tag_id ? byId.get(e.place_tag_id) : undefined;
    const at = own?.lat != null && own.lng != null ? own : place?.lat != null && place.lng != null ? place : null;
    if (!at) {
      missing.push(e);
      continue;
    }
    onMap.push({
      id: e.id,
      slug: own?.slug ?? e.id,
      name: e.name,
      kind: "event",
      lat: at.lat!,
      lng: at.lng!,
      posts: 0,
      href: `/events/${e.id}`,
      detail: `${formatRange(e.starts_on, e.ends_on)} · ${e.venue}`,
    });
  }
  return { onMap, missing };
}
