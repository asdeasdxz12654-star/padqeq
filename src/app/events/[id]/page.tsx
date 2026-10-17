import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FeedList } from "@/components/feed-list";
import { MiniMap } from "@/components/mini-map";
import { ShareButton } from "@/components/share-button";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { formatRange } from "@/lib/events/calendar";
import { cosList } from "@/lib/events/cos-list";
import { attendeeCounts, getEvent, myAttendance } from "@/lib/events/load";
import type { FeedScope } from "@/lib/posts/feed-scope";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { AttendPanel } from "../attend-panel";

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const event = await getEvent((await params).id);
  return event ? { title: event.name, description: `${event.venue} · ${formatRange(event.starts_on, event.ends_on)}` } : { title: "행사" };
}

// S-12 행사 페이지: 기본 정보 · 참가 예정 · 캘린더에 추가 · 사진(행사 태그) · 참가자(공개한 회원)
export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const event = await getEvent((await params).id);
  if (!event) notFound();
  const viewer = await getViewer();
  const today = todayKst();
  const upcoming = event.ends_on >= today;
  const official = event.status === "official";

  const supabase = await createClient();
  const scope: FeedScope | null = event.tag_id ? { kind: "tag", tagId: event.tag_id, year: null } : null;
  const [counts, mine, attendees, tag, place, photos] = await Promise.all([
    official ? attendeeCounts([event.id]) : Promise.resolve(new Map<string, number>()),
    viewer?.profile ? myAttendance(viewer.id, [event.id]) : Promise.resolve(new Map()),
    official
      ? supabase
          .from("event_attendees")
          .select("cos_note, user:profiles!event_attendees_user_id_fkey(handle, display_name)")
          .eq("event_id", event.id)
          .eq("is_public", true)
          .order("created_at")
          .limit(200)
      : Promise.resolve({ data: [] }),
    event.tag_id ? supabase.from("tags").select("slug, name, lat, lng").eq("id", event.tag_id).maybeSingle() : Promise.resolve({ data: null }),
    event.place_tag_id
      ? supabase.from("tags").select("slug, name, lat, lng").eq("id", event.place_tag_id).eq("status", "official").maybeSingle()
      : Promise.resolve({ data: null }),
    scope ? loadScopePage(scope) : Promise.resolve({ items: [], next: null }),
  ]);
  const publicAttendees = (attendees.data ?? []).filter((a) => a.user);
  // 코스 목록 (S-12 ③): 공개한 참가자의 코스 메모를 캐릭터별로
  const costumes = cosList(publicAttendees.map((a) => ({ handle: a.user!.handle, cosNote: a.cos_note })));
  // 지도 위치: 행사 태그에 따로 정한 위치, 없으면 연결된 장소 태그의 위치 (촬영 장소 지도와 같은 규칙)
  const point =
    tag.data?.lat != null && tag.data.lng != null
      ? { lat: tag.data.lat, lng: tag.data.lng }
      : place.data?.lat != null && place.data.lng != null
        ? { lat: place.data.lat, lng: place.data.lng }
        : null;

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-8 pb-16 md:px-6">
      <Link href={`/events?month=${event.starts_on.slice(0, 7)}`} className="text-sm text-quiet hover:underline">
        ‹ 행사 캘린더
      </Link>

      {!official && (
        <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {event.status === "proposed" ? "검토 중인 제안이에요. 운영자가 승인하면 모두에게 보여요." : `등록하지 않은 제안이에요.${event.review_note ? ` 사유: ${event.review_note}` : ""}`}
        </p>
      )}

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-sm">
            <span className="tabular-nums">
              {event.starts_on.replaceAll("-", ".")}
              {event.ends_on !== event.starts_on && ` – ${event.ends_on.slice(5).replace("-", ".")}`}
            </span>
            <span className="text-quiet">
              {" · "}
              {place.data ? (
                <Link href={`/t/${encodeURIComponent(place.data.slug)}`} className="underline underline-offset-2 hover:text-text">
                  {event.venue}
                </Link>
              ) : (
                event.venue
              )}
              {" · "}
              {event.region}
            </span>
          </p>
          <p className="text-sm text-quiet">
            {official && `참가 예정 ${counts.get(event.id) ?? 0}명 · `}게시물 {photos.items.length}
            {photos.next ? "+" : ""}개
          </p>
          <p className="flex flex-wrap gap-x-4 text-sm">
            {event.url && (
              <a href={event.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center underline underline-offset-2">
                공식 사이트
              </a>
            )}
            {official && (
              <a href={`/events/${event.id}/calendar`} className="inline-flex min-h-11 items-center underline underline-offset-2">
                캘린더에 추가 (.ics)
              </a>
            )}
            {tag.data && (
              <Link href={`/t/${encodeURIComponent(tag.data.slug)}`} className="inline-flex min-h-11 items-center underline underline-offset-2">
                #{tag.data.name}
              </Link>
            )}
          </p>
          {event.description && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{event.description}</p>}
          {official && tag.data && point && (
            <div className="mt-2 flex flex-col gap-1.5">
              <MiniMap point={point} label={`${event.venue} 위치 지도`} />
              <Link href={`/map?focus=${encodeURIComponent(tag.data.slug)}`} className="self-start text-sm text-quiet underline underline-offset-2 hover:text-text">
                촬영 장소 지도에서 보기
              </Link>
            </div>
          )}
          {official && (
            <div className="mt-2">
              <ShareButton path={`/events/${event.id}`} title={event.name} />
            </div>
          )}
          {!upcoming && official && <p className="mt-2 text-sm text-quiet">지난 행사예요. 이 행사에서 찍은 사진을 모아 봐요.</p>}
          {!upcoming && official && viewer?.profile?.can_upload && tag.data && (
            <Link
              href={`/upload?event=${event.id}`}
              className="mt-1 inline-flex min-h-11 items-center self-start rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
            >
              이 행사 사진 올리기
            </Link>
          )}
          {upcoming && official && viewer?.profile?.can_upload && tag.data && (
            <p className="mt-2 text-sm text-quiet">이 행사에서 찍은 사진을 올릴 때 태그 #{tag.data.name}을 붙이면 여기에 모여요.</p>
          )}
        </header>

        {official && upcoming && (
          <aside>
            {viewer?.profile ? (
              <AttendPanel eventId={event.id} initial={mine.get(event.id) ?? null} />
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(`/events/${event.id}`)}`}
                className="flex min-h-11 items-center justify-center rounded-xl bg-accent font-semibold text-on-accent"
              >
                로그인하고 참가 예정 표시
              </Link>
            )}
          </aside>
        )}
      </div>

      <section aria-labelledby="photos-heading" className="mt-10">
        <h2 id="photos-heading" className="mb-4 text-lg font-semibold">
          사진
        </h2>
        {scope ? (
          <FeedList key={JSON.stringify(scope)} scope={scope} initial={photos} empty="아직 이 행사에서 찍은 사진이 없어요." />
        ) : (
          <p className="px-4 py-24 text-center text-quiet md:px-6">아직 이 행사에서 찍은 사진이 없어요.</p>
        )}
      </section>

      {official && costumes.length > 0 && (
        <section aria-labelledby="cos-heading" className="mt-10 max-w-3xl">
          <h2 id="cos-heading" className="mb-1 text-lg font-semibold">
            코스 목록 <span className="text-sm font-normal text-quiet">{costumes.length}</span>
          </h2>
          <p className="mb-4 text-xs text-quiet">참가자가 미리 밝힌 캐릭터예요. 현장에서 같은 작품 · 캐릭터를 찾을 때 쓰세요.</p>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {costumes.map((c) => (
              <li key={c.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="font-semibold">{c.name}</span>
                <span className="text-xs text-quiet">{c.handles.length}명</span>
                <span className="flex flex-wrap gap-x-2 text-quiet">
                  {c.handles.map((h) => (
                    <Link key={h} href={profileHref(h)} className="hover:text-text hover:underline">
                      @{h}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {official && (
        <section aria-labelledby="attendees-heading" className="mt-10 max-w-3xl">
          <h2 id="attendees-heading" className="mb-1 text-lg font-semibold">
            참가자 <span className="text-sm font-normal text-quiet">{publicAttendees.length}명 공개</span>
          </h2>
          <p className="mb-4 text-xs text-quiet">참가 예정을 공개한 회원만 보여요. 코스 메모는 현장에서 서로 찾기 위한 것이에요.</p>
          {publicAttendees.length === 0 ? (
            <p className="text-sm text-quiet">공개한 참가자가 없어요.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {publicAttendees.map((a) => (
                <li key={a.user!.handle} className="flex min-w-0 items-baseline gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <Link href={profileHref(a.user!.handle)} className="shrink-0 font-semibold hover:underline">
                    @{a.user!.handle}
                  </Link>
                  <span className="truncate text-quiet">{a.cos_note || a.user!.display_name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
