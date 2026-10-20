import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const MEMBER = "00000000-0000-4000-8000-000000004301";
const POST = "f4300000-0000-4000-8000-000000000001";
const POST2 = "f4300000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${MEMBER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values ('${MEMBER}', 'member43', '작가', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${MEMBER}', '라이덴', 'cosplay', 2026, true),
      ('${POST2}', '${MEMBER}', '라이덴 2', 'cosplay', 2026, true);
    insert into public.photos (post_id, position, width, height, bytes, phash) select id, 0, 100, 100, 1000, 1 from public.posts;
  `);
});

/** 되돌리지 않고 실행 */
async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const urlOf = async (post: string) =>
  (await db.query<{ subject_url: string | null }>("select subject_url from public.consent_records where post_id = $1", [post])).rows[0]?.subject_url;

describe("촬영 동의 기록 · 인물 SNS 주소", () => {
  it("게시할 때 인스타그램 주소를 함께 남긴다 (예전처럼 주소 없이도 된다)", async () => {
    await as(MEMBER, "select publish_my_post($1, '코스어 달빛', '2026-10-16', '', false, false, 'https://www.instagram.com/moon.cos')", [POST]);
    await as(MEMBER, "select publish_my_post($1, '코스어 달빛', '2026-10-16')", [POST2]);
    expect(await urlOf(POST)).toBe("https://www.instagram.com/moon.cos");
    expect(await urlOf(POST2)).toBeNull();
  });

  it("https 주소만 받는다", async () => {
    await expect(
      asUser(db, MEMBER, (tx) => tx.query("select publish_my_post($1, '코스어 달빛', '2026-10-16', '', false, false, 'javascript:alert(1)')", [POST])),
    ).rejects.toThrow(/subject_url/);
  });
});
