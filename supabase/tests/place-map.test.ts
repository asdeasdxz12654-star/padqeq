import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000003301";
const FAN = "00000000-0000-4000-8000-000000003302";
const P1 = "fc000000-0000-4000-8000-000000000001";
const P2 = "fc000000-0000-4000-8000-000000000002";
const DRAFT = "fc000000-0000-4000-8000-000000000003";

let db: PGlite;
const tag: Record<string, string> = {};

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${FAN}');
    insert into public.profiles (id, handle, display_name, role) values ('${ADMIN}', 'wolf1', '운영', 'admin'), ('${FAN}', 'fan1', '팬', 'member');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${P1}', '${ADMIN}', '1', 'landscape', 2026, false), ('${P2}', '${ADMIN}', '2', 'landscape', 2026, false),
      ('${DRAFT}', '${ADMIN}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published' where id <> '${DRAFT}';
  `);
  const make = async (key: string, kind: string, status = "official") => {
    tag[key] = (await db.query<{ id: string }>("insert into public.tags (kind, slug, name, status) values ($1, $2, $2, $3) returning id", [kind, key, status])).rows[0]!.id;
  };
  await make("park", "place");
  await make("comicon", "event");
  await make("genshin", "work");
  await make("secret", "place", "pending");
  await db.query("insert into public.post_tags (post_id, tag_id) values ($1, $2), ($3, $2), ($4, $2), ($1, $5)", [P1, tag.park, P2, DRAFT, tag.comicon]);
});

// 실제로 반영되게 (asUser는 끝에 되돌린다)
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
const locate = (user: string, key: string, lat: number | null, lng: number | null, note = "공원 입구") =>
  as(user, "select set_tag_location($1, $2, $3, $4)", [tag[key], lat, lng, note]);
const map = (user: string | null) =>
  asUser(db, user, (tx) => tx.query<{ slug: string; post_count: number }>("select slug, post_count::int from place_map()")).then((r) => r.rows);

describe("촬영 장소 지도", () => {
  it("운영자만, 이유와 함께, 장소 · 행사 태그에만 위치를 단다", async () => {
    await expect(locate(FAN, "park", 37.5, 127)).rejects.toThrow(/admin_only/);
    await expect(locate(ADMIN, "park", 37.5, 127, " ")).rejects.toThrow(/note_required/);
    await expect(locate(ADMIN, "park", 95, 127)).rejects.toThrow(/location_invalid/);
    await expect(locate(ADMIN, "park", 37.5, null)).rejects.toThrow(/location_invalid/);
    await expect(locate(ADMIN, "genshin", 37.5, 127)).rejects.toThrow(/kind_invalid/);
    await locate(ADMIN, "park", 37.5, 127);
    expect((await db.query("select lat, lng from tags where slug = 'park'")).rows).toEqual([{ lat: 37.5, lng: 127 }]);
    expect((await db.query("select detail->'to' as to from private.audit_log where action = 'tag_location'")).rows).toEqual([{ to: [37.5, 127] }]);
    // 회원은 직접 바꾸지 못한다
    await expect(as(FAN, "update tags set lat = 0, lng = 0")).rejects.toThrow(/permission denied/);
  });

  it("지도: 위치가 있는 공식 태그만, 게시된 글 수가 많은 순", async () => {
    await locate(ADMIN, "park", 37.5, 127);
    await locate(ADMIN, "comicon", 37.51, 127.06);
    await db.query("update tags set lat = 1, lng = 1 where slug = 'secret'");
    expect(await map(null)).toEqual([
      { slug: "park", post_count: 2 },
      { slug: "comicon", post_count: 1 },
    ]);
    // 위치를 지우면 지도에서 빠진다
    await locate(ADMIN, "comicon", null, null, "위치 잘못");
    expect((await map(FAN)).map((r) => r.slug)).toEqual(["park"]);
  });
});
