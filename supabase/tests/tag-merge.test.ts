import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000003501";
const MOD = "00000000-0000-4000-8000-000000003502";
const FAN = "00000000-0000-4000-8000-000000003503";
const P1 = "fd000000-0000-4000-8000-000000000001";
const P2 = "fd000000-0000-4000-8000-000000000002";

let db: PGlite;
const tag: Record<string, string> = {};

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MOD}'), ('${FAN}');
    insert into public.profiles (id, handle, display_name, role) values
      ('${ADMIN}', 'boss1', '운영', 'admin'), ('${MOD}', 'mod1', '도우미', 'moderator'), ('${FAN}', 'fan1', '팬', 'member');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${P1}', '${ADMIN}', '1', 'landscape', 2026, false), ('${P2}', '${ADMIN}', '2', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published';
  `);
  const make = async (key: string, kind: string, name = key, status = "official", parent: string | null = null) => {
    tag[key] = (
      await db.query<{ id: string }>("insert into public.tags (kind, slug, name, status, parent_id) values ($1, $2, $3, $4, $5) returning id", [kind, key, name, status, parent])
    ).rows[0]!.id;
  };
  await make("exco", "place", "대구 엑스코");
  await make("exco-addr", "place", "대구광역시 북구 엑스코로 10");
  await make("park", "place");
  await make("genshin", "work", "원신");
  await make("genshin-2", "work", "Genshin");
  await make("hutao", "character", "호두", "official", tag["genshin-2"]);
  await db.query("insert into public.tag_aliases (tag_id, alias) values ($1, 'EXCO 주소'), ($1, '대구 엑스코')", [tag["exco-addr"]]);
  await db.query("update public.tags set lat = 35.9, lng = 128.6 where slug = 'exco-addr'");
  await db.query("insert into public.post_tags (post_id, tag_id) values ($1, $2), ($3, $2), ($1, $4)", [P1, tag["exco-addr"], P2, tag.exco]);
  await db.query("insert into public.tag_follows (user_id, tag_id) values ($1, $2), ($1, $3), ($4, $2)", [FAN, tag["exco-addr"], tag.exco, ADMIN]);
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
const merge = (user: string, from: string, to: string, note = "같은 장소") =>
  as(user, "select merge_tags($1, $2, $3) as r", [tag[from], tag[to], note]).then((rows) => (rows[0] as { r: Record<string, unknown> }).r);

describe("태그 합치기", () => {
  it("최고 관리자만, 이유와 함께, 같은 종류 · 공식 태그로만", async () => {
    await expect(merge(FAN, "exco-addr", "exco")).rejects.toThrow(/admin_only/);
    await expect(merge(MOD, "exco-addr", "exco")).rejects.toThrow(/admin_only/);
    await expect(merge(ADMIN, "exco-addr", "exco", " ")).rejects.toThrow(/note_required/);
    await expect(merge(ADMIN, "exco", "exco")).rejects.toThrow(/same_tag/);
    await expect(merge(ADMIN, "exco", "genshin")).rejects.toThrow(/kind_mismatch/);
    await db.query("update public.tags set status = 'pending' where slug = 'park'");
    await expect(merge(ADMIN, "exco", "park")).rejects.toThrow(/target_not_official/);
    await expect(as(FAN, "delete from tags")).rejects.toThrow(/permission denied/);
  });

  it("게시물 · 팔로우 · 별칭 · 위치 · 예전 주소를 옮기고 없앤 태그는 지운다", async () => {
    const r = await merge(ADMIN, "exco-addr", "exco");
    // P1은 이미 exco가 붙어 있어 한 번만, P2는 옮김
    expect(r).toEqual({ posts: 1, follows: 1, aliases: 2, children: 0, event: false, location: true });
    expect((await db.query("select post_id from post_tags where tag_id = $1 order by post_id", [tag.exco])).rows).toEqual([{ post_id: P1 }, { post_id: P2 }]);
    expect((await db.query("select user_id from tag_follows where tag_id = $1 order by user_id", [tag.exco])).rows).toEqual([{ user_id: ADMIN }, { user_id: FAN }]);
    // 남길 태그 이름과 같은 별칭('대구 엑스코')은 빼고, 없앤 태그 이름은 별칭으로
    expect((await db.query("select alias::text from tag_aliases where tag_id = $1 order by alias", [tag.exco])).rows.map((a) => (a as { alias: string }).alias)).toEqual([
      "EXCO 주소",
      "대구광역시 북구 엑스코로 10",
    ]);
    expect((await db.query("select lat, lng from tags where slug = 'exco'")).rows).toEqual([{ lat: 35.9, lng: 128.6 }]);
    expect((await db.query("select count(*)::int as n from tags where slug = 'exco-addr'")).rows).toEqual([{ n: 0 }]);
    // 예전 주소는 누구나 찾아 남길 태그로 간다
    const redirect = await asUser(db, null, (tx) => tx.query("select r.old_slug, t.slug from tag_slug_redirects r join tags t on t.id = r.tag_id"));
    expect(redirect.rows).toEqual([{ old_slug: "exco-addr", slug: "exco" }]);
    expect((await db.query("select detail->>'note' as note, detail->'from'->>'slug' as from_slug, detail->>'posts' as posts from private.audit_log where action = 'tag_merge'")).rows).toEqual([
      { note: "같은 장소", from_slug: "exco-addr", posts: "1" },
    ]);
  });

  it("예전 주소는 다시 합쳐도 마지막 태그로 이어진다 · 하위 캐릭터도 옮긴다", async () => {
    await merge(ADMIN, "exco-addr", "exco");
    await merge(ADMIN, "exco", "park");
    expect((await db.query("select old_slug from tag_slug_redirects where tag_id = $1 order by old_slug", [tag.park])).rows).toEqual([
      { old_slug: "exco" },
      { old_slug: "exco-addr" },
    ]);
    const r = await merge(ADMIN, "genshin-2", "genshin");
    expect(r).toMatchObject({ children: 1, aliases: 1 });
    expect((await db.query("select parent_id from tags where slug = 'hutao'")).rows).toEqual([{ parent_id: tag.genshin }]);
  });

  it("행사는 한 태그에 하나: 옮기거나, 둘 다 있으면 막는다", async () => {
    const event = async (name: string, tagKey: string) =>
      db.query(
        "insert into public.events (name, starts_on, ends_on, venue, region, status, tag_id) values ($1, '2026-11-01', '2026-11-01', '엑스코', '대구', 'official', $2)",
        [name, tag[tagKey]],
      );
    await event("대구콘페", "exco-addr");
    expect(await merge(ADMIN, "exco-addr", "exco")).toMatchObject({ event: true });
    expect((await db.query("select t.slug from events e join tags t on t.id = e.tag_id")).rows).toEqual([{ slug: "exco" }]);
    await event("다른 행사", "park");
    await expect(merge(ADMIN, "park", "exco")).rejects.toThrow(/event_conflict/);
  });
});
