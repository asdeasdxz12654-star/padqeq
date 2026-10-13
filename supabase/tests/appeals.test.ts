import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-0000000000f1";
const AUTHOR = "00000000-0000-4000-8000-0000000000f2";
const OTHER = "00000000-0000-4000-8000-0000000000f3";
const POST = "70000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'operator1', '운영', 'admin', true),
      ('${AUTHOR}', 'author1', '작가', 'member', true),
      ('${OTHER}', 'other1', '남', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '대상', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published';
  `);
});

/** 되돌리지 않는 세션 */
async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const moderate = (decision: string) => as(ADMIN, "select public.moderate_post($1, $2, '사유')", [POST, decision]);
const appeal = (user = AUTHOR, statement = "동의를 받은 사진입니다. 확인 부탁드려요.") =>
  as(user, "insert into appeals (post_id, author_id, statement) values ($1, $2, $3)", [POST, user, statement]);
const appealStatuses = async () =>
  (await db.query<{ status: string }>("select status::text from appeals order by created_at")).rows.map((r) => r.status);
const kinds = async () =>
  (await db.query<{ kind: string }>("select kind::text from notifications where recipient_id = $1 order by id", [AUTHOR])).rows.map(
    (r) => r.kind,
  );
const post = async () =>
  (await db.query<{ status: string; held_at: string | null; removed_at: string | null }>("select status::text, held_at, removed_at from posts where id = $1", [POST])).rows[0]!;

describe("소명", () => {
  it("조치되지 않은 글에는 소명할 수 없다", async () => {
    await expect(appeal()).rejects.toThrow(/appeal_not_allowed/);
  });

  it("남의 글에는 소명할 수 없다", async () => {
    await moderate("hold");
    await expect(appeal(OTHER)).rejects.toThrow(/appeal_not_allowed|row-level security/);
  });

  it("임시조치 소명을 받아들이면(해제) 다시 공개된다", async () => {
    await moderate("hold");
    await appeal();
    // 처리 전에는 하나만
    await expect(appeal()).rejects.toThrow(/duplicate key/);
    await moderate("release");
    expect(await appealStatuses()).toEqual(["accepted"]);
    expect((await post()).held_at).toBeNull();
    expect(await kinds()).toEqual(["post_held", "post_released"]);
  });

  it("조치를 유지하면 소명이 거절되고 알린다", async () => {
    await moderate("hold");
    await appeal();
    await moderate("hold");
    expect(await appealStatuses()).toEqual(["rejected"]);
    expect(await kinds()).toEqual(["post_held", "appeal_rejected"]);
  });

  it("게시물당 3번까지", async () => {
    await moderate("hold");
    for (let i = 0; i < 3; i++) {
      await appeal();
      await moderate("hold");
    }
    await expect(appeal()).rejects.toThrow(/appeal_limit/);
  });

  it("운영자가 게시 중단한 글은 작성자가 다시 게시할 수 없고, 소명이 받아들여지면 복구된다", async () => {
    await moderate("hide");
    await expect(as(AUTHOR, "update posts set status = 'published' where id = $1", [POST])).rejects.toThrow(
      /post_removed_by_moderator/,
    );
    await appeal();
    await moderate("restore");
    expect(await post()).toMatchObject({ status: "published", removed_at: null });
    expect(await appealStatuses()).toEqual(["accepted"]);
    expect(await kinds()).toEqual(["post_hidden", "post_restored"]);
  });

  it("작성자가 스스로 숨긴 글은 다시 게시할 수 있다", async () => {
    await as(AUTHOR, "update posts set status = 'hidden' where id = $1", [POST]);
    await as(AUTHOR, "update posts set status = 'published' where id = $1", [POST]);
    expect((await post()).status).toBe("published");
  });

  it("소명은 본인과 운영자만 보고, 상태는 바꿀 수 없다", async () => {
    await moderate("hold");
    await appeal();
    expect((await asUser(db, OTHER, (tx) => tx.query("select 1 from appeals"))).rows).toHaveLength(0);
    expect((await asUser(db, ADMIN, (tx) => tx.query("select 1 from appeals"))).rows).toHaveLength(1);
    await expect(asUser(db, AUTHOR, (tx) => tx.query("update appeals set status = 'accepted'"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("게시 중단되지 않은 글은 복구할 수 없다", async () => {
    await expect(moderate("restore")).rejects.toThrow(/not_removed/);
  });
});
