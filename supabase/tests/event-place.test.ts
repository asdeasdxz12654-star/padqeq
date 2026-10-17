import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000003601";
const MOD = "00000000-0000-4000-8000-000000003602";
const FAN = "00000000-0000-4000-8000-000000003603";

let db: PGlite;
const tag: Record<string, string> = {};
let eventId = "";

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MOD}'), ('${FAN}');
    insert into public.profiles (id, handle, display_name, role) values
      ('${ADMIN}', 'boss1', '운영', 'admin'), ('${MOD}', 'mod1', '도우미', 'moderator'), ('${FAN}', 'fan1', '팬', 'member');
  `);
  const make = async (key: string, kind: string, status = "official") => {
    tag[key] = (await db.query<{ id: string }>("insert into public.tags (kind, slug, name, status) values ($1, $2, $2, $3) returning id", [kind, key, status])).rows[0]!.id;
  };
  await make("exco", "place");
  await make("exco-addr", "place");
  await make("pending-place", "place", "pending");
  await make("daegu-con", "event");
  await make("genshin", "work");
  eventId = (
    await db.query<{ id: string }>(
      "insert into public.events (name, starts_on, ends_on, venue, region, status, tag_id) values ('대구콘페', '2026-11-01', '2026-11-02', '엑스코', '대구', 'official', $1) returning id",
      [tag["daegu-con"]],
    )
  ).rows[0]!.id;
});

async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const setPlace = (user: string, place: string | null) => as(user, "select set_event_place($1, $2)", [eventId, place]);
const mapRows = async () =>
  (await asUser(db, null, (tx) => tx.query<{ slug: string; lat: number; lng: number }>("select slug, lat, lng from place_map() order by slug"))).rows;

describe("행사에 장소 태그 연결", () => {
  it("최고 관리자만, 공식 장소 태그로만, 회원은 직접 바꾸지 못한다", async () => {
    await expect(setPlace(FAN, tag.exco!)).rejects.toThrow(/admin_only/);
    await expect(setPlace(MOD, tag.exco!)).rejects.toThrow(/admin_only/);
    await expect(setPlace(ADMIN, tag.genshin!)).rejects.toThrow(/place_invalid/);
    await expect(setPlace(ADMIN, tag["pending-place"]!)).rejects.toThrow(/place_invalid/);
    await expect(as(ADMIN, "select set_event_place($1, $2)", [tag.exco, tag.exco])).rejects.toThrow(/event_not_found/);
    await expect(as(FAN, "update events set place_tag_id = $1", [tag.exco])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => tx.query("select set_event_place($1, $2)", [eventId, tag.exco]))).rejects.toThrow(/permission denied/);

    await setPlace(ADMIN, tag.exco!);
    await setPlace(ADMIN, tag.exco!); // 같은 값이면 기록하지 않는다
    await setPlace(ADMIN, null);
    expect((await db.query("select place_tag_id from events")).rows).toEqual([{ place_tag_id: null }]);
    expect((await db.query("select detail->>'place' as place from private.audit_log where action = 'event_place' order by created_at, id")).rows).toHaveLength(2);
  });

  it("행사 태그에 위치가 없으면 지도에 장소 위치로 나온다 · 자기 위치가 있으면 그걸 쓴다", async () => {
    await setPlace(ADMIN, tag.exco!);
    expect(await mapRows()).toEqual([]);
    await db.query("update tags set lat = 35.9068, lng = 128.6133 where slug = 'exco'");
    expect(await mapRows()).toEqual([
      { slug: "daegu-con", lat: 35.9068, lng: 128.6133 },
      { slug: "exco", lat: 35.9068, lng: 128.6133 },
    ]);
    await db.query("update tags set lat = 35.91, lng = 128.62 where slug = 'daegu-con'");
    expect((await mapRows()).find((r) => r.slug === "daegu-con")).toEqual({ slug: "daegu-con", lat: 35.91, lng: 128.62 });
  });

  it("장소 태그를 합치면 행사 연결도 옮기고, 장소 태그를 지우면 연결만 풀린다", async () => {
    await setPlace(ADMIN, tag["exco-addr"]!);
    expect(await as(ADMIN, "select merge_tags($1, $2, '같은 곳') as r", [tag["exco-addr"], tag.exco])).toEqual([{ r: expect.objectContaining({ places: 1 }) }]);
    expect((await db.query("select place_tag_id from events")).rows).toEqual([{ place_tag_id: tag.exco }]);
    await db.query("delete from tags where slug = 'exco'");
    expect((await db.query("select name, place_tag_id from events")).rows).toEqual([{ name: "대구콘페", place_tag_id: null }]);
  });
});

describe("행사 제안 때 장소 고르기", () => {
  const propose = (place: string | null) =>
    as(FAN, "insert into events (name, starts_on, ends_on, venue, region, proposed_by, place_tag_id) values ('새 행사', '2099-01-01', '2099-01-01', '엑스코', '대구', $1, $2)", [FAN, place]);

  it("회원은 공식 장소 태그만 고를 수 있고, 운영자는 승인 전에 바꿀 수 있다", async () => {
    await expect(propose(tag.genshin!)).rejects.toThrow(/place_invalid/);
    await expect(propose(tag["pending-place"]!)).rejects.toThrow(/place_invalid/);
    await propose(tag["exco-addr"]!);
    await propose(null);
    const proposal = (await db.query<{ id: string; place_tag_id: string }>("select id, place_tag_id from events where name = '새 행사' and place_tag_id is not null")).rows[0]!;
    expect(proposal.place_tag_id).toBe(tag["exco-addr"]);
    await as(ADMIN, "select set_event_place($1, $2)", [proposal.id, tag.exco]);
    expect((await db.query("select place_tag_id from events where id = $1", [proposal.id])).rows).toEqual([{ place_tag_id: tag.exco }]);
    // 장소 칸 말고는 여전히 못 바꾼다
    await expect(as(FAN, "update events set place_tag_id = null where id = $1", [proposal.id])).rejects.toThrow(/permission denied/);
  });
});
