import "server-only";
import { todayKst } from "@/lib/auth/signup-input";
import { listEvents } from "@/lib/events/load";
import type { CATEGORIES } from "@/lib/photos/post-input";
import { createClient } from "@/lib/supabase/server";
import { type FeedItem, loadFeedByIds } from "./feed";
import { loadScopePage } from "./feed-scope-server";

// 홈 '주제별 섹션' (디자인 개편 v2): 끝없는 사진 목록 대신 주제마다 몇 장씩 정리해서 보여 준다.
// 사진이 적은 섹션은 숨긴다 (빈 섹션이 늘어서 보이지 않게).

export const SHELF_MIN = 4;
const SHELF_SIZE = 10;
type Category = (typeof CATEGORIES)[number];

export type Shelf = { category: Category; items: FeedItem[]; popular: boolean };
export type EventShelf = { id: string; name: string; startsOn: string; endsOn: string; venue: string; items: FeedItem[] };
export type TagTile = { slug: string; name: string; total: number; cover: FeedItem | null };
export type Exhibition = { id: string; title: string; note: string; handle: string; items: FeedItem[] };

/** 전시: 운영자가 건 공개 컬렉션 (최근에 건 것 2곳). 볼 수 있는 사진이 3장 이상일 때만 */
async function exhibitions(): Promise<Exhibition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id, title, description, exhibit_note, owner:profiles!collections_owner_id_fkey(handle)")
    .not("exhibited_at", "is", null)
    .order("exhibited_at", { ascending: false })
    .limit(2);
  if (error) throw error;
  const shown = await Promise.all(
    data.map(async (c) => {
      const { data: rows } = await supabase.from("collection_posts").select("post_id").eq("collection_id", c.id).order("added_at", { ascending: false }).limit(5);
      const items = await loadFeedByIds((rows ?? []).map((r) => r.post_id));
      return { id: c.id, title: c.title, note: c.exhibit_note || c.description.slice(0, 120), handle: c.owner?.handle ?? "", items };
    }),
  );
  return shown.filter((e) => e.items.length >= 3 && e.handle);
}

const shift = (days: number) => {
  const d = new Date(`${todayKst()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 분류별: 최근 좋아요가 많은 순, 모자라면 최신순 */
async function shelf(category: Category): Promise<Shelf> {
  const popular = await loadScopePage({ kind: "explore", year: null, category, q: null, sort: "popular" });
  if (popular.items.length >= SHELF_MIN) return { category, items: popular.items.slice(0, SHELF_SIZE), popular: true };
  const latest = await loadScopePage({ kind: "explore", year: null, category, q: null, sort: "latest" });
  return { category, items: latest.items.slice(0, SHELF_SIZE), popular: false };
}

/** 최근 두 달 안의 행사 중 사진이 있는 곳 (최근 것부터 3곳) */
async function eventShelves(): Promise<EventShelf[]> {
  const events = (await listEvents(shift(-60), shift(0))).filter((e) => e.tag_id).reverse().slice(0, 4);
  const withPhotos = await Promise.all(
    events.map(async (e) => {
      const page = await loadScopePage({ kind: "tag", tagId: e.tag_id!, year: null });
      return { id: e.id, name: e.name, startsOn: e.starts_on, endsOn: e.ends_on, venue: e.venue, items: page.items.slice(0, 3) };
    }),
  );
  return withPhotos.filter((e) => e.items.length > 0).slice(0, 3);
}

/** 지금 많이 찍는 작품 (최근 30일) + 대표 사진 한 장 */
async function tagTiles(): Promise<TagTile[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("trending_works", { days: 30, max_rows: 6 });
  const works = data ?? [];
  return Promise.all(
    works.map(async (w) => {
      const page = await loadScopePage({ kind: "tag", tagId: w.id, year: null });
      return { slug: w.slug, name: w.name, total: Number(w.total_count), cover: page.items[0] ?? null };
    }),
  );
}

export async function loadHomeSections() {
  const [cosplay, model, landscape, events, tags, latest, shows] = await Promise.all([
    shelf("cosplay"),
    shelf("model"),
    shelf("landscape"),
    eventShelves().catch(() => []),
    tagTiles().catch(() => []),
    loadScopePage({ kind: "home", year: null, feed: "latest" }),
    exhibitions().catch(() => []),
  ]);
  return {
    shelves: [cosplay, model, landscape].filter((s) => s.items.length >= SHELF_MIN),
    events,
    tags: tags.length >= 3 ? tags : [],
    latest: latest.items.slice(0, 10),
    exhibitions: shows,
  };
}
