import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000001001";
const ARTIST = "00000000-0000-4000-8000-000000001002";
const LEAVER = "00000000-0000-4000-8000-000000001003";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${ARTIST}'), ('${LEAVER}');
    insert into public.profiles (id, handle, display_name, role, can_upload, deletion_requested_at) values
      ('${ME}', 'me1', '나', 'member', false, null),
      ('${ARTIST}', 'artist1', '작가', 'member', true, null),
      ('${LEAVER}', 'leaver1', '떠남', 'member', true, now());
  `);
});

const follow = (who: string, target: string) =>
  asUser(db, who, (tx) => tx.query("insert into member_follows (follower_id, followee_id) values ($1, $2)", [who, target]));

describe("회원 팔로우", () => {
  it("팔로우하고 내 목록에서만 본다", async () => {
    const mine = await asUser(db, ME, async (tx) => {
      await tx.query("insert into member_follows (follower_id, followee_id) values ($1, $2)", [ME, ARTIST]);
      return (await tx.query("select followee_id from member_follows")).rows;
    });
    expect(mine).toEqual([{ followee_id: ARTIST }]);
    await db.query("insert into member_follows (follower_id, followee_id) values ($1, $2)", [ME, ARTIST]);
    // 팔로우당한 사람도 누가 팔로우했는지 볼 수 없다
    expect((await asUser(db, ARTIST, (tx) => tx.query("select 1 from member_follows"))).rows).toHaveLength(0);
  });

  it("자기 자신 · 탈퇴 유예 회원은 팔로우할 수 없다", async () => {
    await expect(follow(ME, ME)).rejects.toThrow(/check constraint/);
    await expect(follow(ME, LEAVER)).rejects.toThrow(/row-level security/);
  });

  it("남 대신 팔로우할 수 없다", async () => {
    await expect(
      asUser(db, ME, (tx) => tx.query("insert into member_follows (follower_id, followee_id) values ($1, $2)", [ARTIST, ME])),
    ).rejects.toThrow(/row-level security/);
  });

  it("비로그인은 볼 수 없다", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select 1 from member_follows"))).rejects.toThrow(/permission denied/);
  });
});
