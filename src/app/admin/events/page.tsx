import { requireTopAdmin } from "@/lib/auth/require-admin";
import type { Metadata } from "next";
import Link from "next/link";
import type { EventDraft } from "@/components/event-form";
import { todayKst } from "@/lib/auth/signup-input";
import { REGIONS, type Region, formatRange } from "@/lib/events/calendar";
import { createClient } from "@/lib/supabase/server";
import { EventAdminEditor } from "./event-admin-forms";

export const metadata: Metadata = { title: "행사 관리" };

// 운영자 행사 관리: 제안 검토 · 등록 · 고치기

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export default async function AdminEventsPage({ searchParams }: PageProps<"/admin/events">) {
  await requireTopAdmin();
  const params = await searchParams;
  const edit = typeof params.edit === "string" ? params.edit : null;
  const today = todayKst();
  const supabase = await createClient();
  const [{ data: proposals, error: e1 }, { data: events, error: e2 }, { data: places, error: e3 }] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, starts_on, ends_on, venue, region, url, description, status, place_tag_id, proposer:profiles!events_proposed_by_fkey(handle)")
      .eq("status", "proposed")
      .order("created_at")
      .limit(100),
    supabase
      .from("events")
      .select("id, name, starts_on, ends_on, venue, region, url, description, status, place_tag_id, proposer:profiles!events_proposed_by_fkey(handle)")
      .eq("status", "official")
      .gte("ends_on", daysAgo(180))
      .order("starts_on", { ascending: false })
      .limit(200),
    // 행사가 열리는 곳으로 고를 공식 장소 태그
    supabase.from("tags").select("id, name, lat").eq("kind", "place").eq("status", "official").order("name").limit(1000),
  ]);
  if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
  const placeOptions = places.map((p) => ({ id: p.id, name: p.name, hasLocation: p.lat !== null }));

  const selected = [...proposals, ...events].find((e) => e.id === edit) ?? null;
  const draft: EventDraft | null =
    edit === "new"
      ? { name: "", startsOn: today, endsOn: today, venue: "", region: "서울", url: "", description: "" }
      : selected
        ? {
            name: selected.name,
            startsOn: selected.starts_on,
            endsOn: selected.ends_on,
            venue: selected.venue,
            region: (REGIONS as readonly string[]).includes(selected.region) ? (selected.region as Region) : "서울",
            url: selected.url ?? "",
            description: selected.description,
          }
        : null;

  const row = (e: (typeof events)[number]) => (
    <li key={e.id}>
      <Link
        href={`/admin/events?edit=${e.id}`}
        aria-current={edit === e.id ? "true" : undefined}
        className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface aria-[current=true]:bg-surface"
      >
        <span className="w-24 shrink-0 tabular-nums text-quiet">{formatRange(e.starts_on, e.ends_on)}</span>
        <span className="min-w-0 flex-1 truncate">{e.name}</span>
        <span className="shrink-0 text-xs text-quiet">
          {e.region}
          {e.status === "proposed" && e.proposer ? ` · @${e.proposer.handle}` : ""}
          {e.status === "official" && e.place_tag_id === null && <span className="ml-1 rounded-full bg-amber-400/20 px-1.5 text-amber-200">장소 없음</span>}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">행사 관리</h1>
        <Link href="/admin/events?edit=new" className="rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
          새 행사
        </Link>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="proposals-heading">
            <h2 id="proposals-heading" className="mb-2 font-semibold">
              검토할 제안 {proposals.length}
            </h2>
            {proposals.length === 0 ? (
              <p className="text-sm text-quiet">검토할 제안이 없어요.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">{proposals.map(row)}</ul>
            )}
          </section>
          <section aria-labelledby="events-heading">
            <h2 id="events-heading" className="mb-2 font-semibold">
              등록된 행사 <span className="text-sm font-normal text-quiet">최근 반년 · 다가오는 행사</span>
            </h2>
            {events.length === 0 ? <p className="text-sm text-quiet">등록된 행사가 없어요.</p> : <ul className="divide-y divide-line rounded-xl border border-line">{events.map(row)}</ul>}
          </section>
        </div>
        <section aria-label="행사 편집">
          {draft ? (
            <EventAdminEditor
              id={edit === "new" ? null : edit}
              initial={draft}
              proposed={selected?.status === "proposed"}
              placeId={selected?.place_tag_id ?? null}
              places={placeOptions}
            />
          ) : (
            <p className="text-sm text-quiet">왼쪽에서 행사를 고르거나 새 행사를 등록하세요.</p>
          )}
        </section>
      </div>
    </div>
  );
}
