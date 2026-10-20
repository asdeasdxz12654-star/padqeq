import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000000c01";
const OTHER = "00000000-0000-4000-8000-000000000c02";
const OFFICIAL = "a0000000-0000-4000-8000-000000000001";
const PENDING = "a0000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ME}', 'me1', '나', 'member', false), ('${OTHER}', 'other1', '남', 'member', true);
    insert into public.tags (id, slug, name, kind, status, created_by) values
      ('${OFFICIAL}', 'sakura', '벚꽃', 'general', 'official', null),
      ('${PENDING}', 'secret', '남의 제안', 'general', 'pending', '${OTHER}');
  `);
});

const follow = (user: string, tag: string) =>
  asUser(db, user, (tx) => tx.query("insert into tag_follows (user_id, tag_id) values ($1, $2)", [user, tag]));

describe("태그 팔로우", () => {
  it("공식 태그를 팔로우하고 내 목록에서 본다", async () => {
    const rows = await asUser(db, ME, async (tx) => {
      await tx.query("insert into tag_follows (user_id, tag_id) values ($1, $2)", [ME, OFFICIAL]);
      return (await tx.query("select tag_id from tag_follows")).rows;
    });
    expect(rows).toEqual([{ tag_id: OFFICIAL }]);
  });

  it("운영자 확인 전 새 태그(남이 만든 것)도 팔로우할 수 있다", async () => {
    await follow(ME, PENDING);
  });

  it("남 대신 팔로우할 수 없고, 남의 팔로우 목록은 보이지 않는다", async () => {
    await expect(follow(ME, OFFICIAL).then(() => asUser(db, ME, (tx) => tx.query("insert into tag_follows (user_id, tag_id) values ($1, $2)", [OTHER, OFFICIAL])))).rejects.toThrow(
      /row-level security/,
    );
    await db.query("insert into tag_follows (user_id, tag_id) values ($1, $2)", [OTHER, OFFICIAL]);
    expect((await asUser(db, ME, (tx) => tx.query("select 1 from tag_follows"))).rows).toHaveLength(0);
    expect((await asUser(db, null, (tx) => tx.query("select 1 from tag_follows")).catch((e: Error) => e.message))).toMatch(/permission denied/);
  });

  it("300개까지", async () => {
    await db.exec(`
      insert into public.tags (slug, name, kind, status) select 't' || g, '태그' || g, 'general', 'official' from generate_series(1, 300) g;
      insert into public.tag_follows (user_id, tag_id) select '${ME}', id from public.tags where slug like 't%';
    `);
    await expect(follow(ME, OFFICIAL)).rejects.toThrow(/tag_follow_limit/);
  });
});
