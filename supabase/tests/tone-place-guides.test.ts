import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000003901";
const ADMIN = "00000000-0000-4000-8000-000000003902";
const WARM = "f3900000-0000-4000-8000-000000000001";
const COOL = "f3900000-0000-4000-8000-000000000002";
const DRAFT = "f3900000-0000-4000-8000-000000000003";

let db: PGlite;
let place: string;
let pendingPlace: string;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${ADMIN}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ME}', 'me39', '나', 'member', true), ('${ADMIN}', 'admin39', '운영', 'admin', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${WARM}', '${ME}', '노을', 'landscape', 2026, false),
      ('${COOL}', '${ME}', '바다', 'landscape', 2026, false),
      ('${DRAFT}', '${ME}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes, color) values
      ('${WARM}', 0, 100, 100, 1000, '#d9643a'), ('${WARM}', 1, 100, 100, 1000, '#2050c0'),
      ('${COOL}', 0, 100, 100, 1000, '#2a6fb8'),
      ('${DRAFT}', 0, 100, 100, 1000, '#d9643a');
    update public.posts set status = 'published', published_at = now() where id <> '${DRAFT}';
  `);
  const tag = async (slug: string, status: string) =>
    (await db.query<{ id: string }>("insert into public.tags (kind, slug, name, status) values ('place', $1, $1, $2) returning id", [slug, status])).rows[0]!.id;
  place = await tag("올림픽공원", "official");
  pendingPlace = await tag("어딘가", "pending");
});

describe("색감", () => {
  it("대표 색에서 색감을 정한다", async () => {
    const tones = await db.query<{ t: string | null }>(
      "select private.color_tone(c) as t from unnest(array['#d9643a', '#2a6fb8', '#808080', '#f4d6e0', '#101010', null]) as c",
    );
    expect(tones.rows.map((r) => r.t)).toEqual(["warm", "cool", "mono", "pastel", "dark", null]);
  });

  it("첫 사진 기준 · 게시된 글만", async () => {
    const pick = (tone: string) => asUser(db, null, async (tx) => (await tx.query<{ post_id: string }>("select post_id from tone_posts($1)", [tone])).rows.map((r) => r.post_id));
    expect(await pick("warm")).toEqual([WARM]);
    expect(await pick("cool")).toEqual([COOL]);
  });
});

/** 되돌리지 않고 실행 (2단계 인증을 마친 세션) */
async function commitAs(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await db.query(sql, params);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

describe("촬영지 가이드", () => {
  const set = (user: string, target: string, tip: string) =>
    commitAs(user, "select set_place_guide($1, '해 질 녘', '무료', '가능', '공영 주차장', $2)", [target, tip]);
  const read = () => asUser(db, null, async (tx) => (await tx.query<{ tip: string }>("select tip from place_guides")).rows);

  it("운영자만 적고, 누구나 본다", async () => {
    await expect(set(ME, place, "팁")).rejects.toThrow(/staff_only/);
    await set(ADMIN, place, "평화의 문 앞이 좋아요");
    expect(await read()).toEqual([{ tip: "평화의 문 앞이 좋아요" }]);
    const audit = await db.query<{ n: number }>("select count(*)::int as n from private.audit_log where action = 'place_guide'");
    expect(audit.rows[0]!.n).toBe(1);
  });

  it("공식 장소 태그에만", async () => {
    await expect(set(ADMIN, pendingPlace, "팁")).rejects.toThrow(/not_official_place/);
  });

  it("모두 비우면 지운다 · 고쳐 쓰면 바뀐다", async () => {
    await set(ADMIN, place, "처음");
    await set(ADMIN, place, "다시");
    expect(await read()).toEqual([{ tip: "다시" }]);
    await commitAs(ADMIN, "select set_place_guide($1)", [place]);
    expect(await read()).toEqual([]);
  });

  it("직접 쓰기는 막힌다", async () => {
    await expect(asUser(db, ADMIN, (tx) => tx.query("insert into place_guides (tag_id, tip) values ($1, '몰래')", [place]))).rejects.toThrow(/permission/);
  });
});
