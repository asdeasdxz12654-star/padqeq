import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-0000000000d1";
const DRAFT = "50000000-0000-4000-8000-000000000001";
const PUBLISHED = "50000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values ('${AUTHOR}', 'author1', '작가', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${DRAFT}', '${AUTHOR}', '초안', 'landscape', 2026, false),
      ('${PUBLISHED}', '${AUTHOR}', '게시', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values
      ('${DRAFT}', 0, 100, 100, 1000), ('${DRAFT}', 1, 100, 100, 1000), ('${PUBLISHED}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id = '${PUBLISHED}';
  `);
});

const keysOf = async (post: string) =>
  (await db.query<{ storage_key: string }>("select storage_key from photos where post_id = $1 order by position", [post])).rows.map(
    (r) => r.storage_key,
  );
const trash = async () =>
  (await db.query<{ storage_key: string }>("select storage_key from private.storage_trash order by storage_key")).rows.map(
    (r) => r.storage_key,
  );
const due = async () =>
  (await db.query<{ k: string }>("select k from private.storage_trash_due() as k order by k")).rows.map((r) => r.k);

describe("사진 파일 정리", () => {
  it("게시물을 지우면 사진 파일 위치가 정리 목록에 들어간다", async () => {
    const keys = await keysOf(DRAFT);
    // 회원 권한으로 지운다 (asUser는 끝나면 되돌리므로 같은 트랜잭션 안에서 확인)
    const queued = await asUser(db, AUTHOR, async (tx) => {
      await tx.query("delete from posts where id = $1", [DRAFT]);
      await tx.exec("reset role");
      return (await tx.query<{ storage_key: string }>("select storage_key from private.storage_trash order by storage_key")).rows;
    });
    expect(queued.map((r) => r.storage_key)).toEqual([...keys].sort());
  });

  it("탈퇴 영구 삭제로 지워진 사진도 정리 목록에 들어간다", async () => {
    const keys = [...(await keysOf(DRAFT)), ...(await keysOf(PUBLISHED))].sort();
    await db.exec(`delete from auth.users where id = '${AUTHOR}'`);
    expect(await trash()).toEqual(keys);
  });

  it("7일이 지나야 파일 삭제 대상이 되고, 완료 처리하면 목록에서 빠진다", async () => {
    await db.exec(`delete from posts where id = '${DRAFT}'`);
    expect(await due()).toEqual([]);
    await db.exec("update private.storage_trash set queued_at = now() - interval '8 days'");
    const keys = await due();
    expect(keys).toHaveLength(2);
    await db.query("select private.storage_trash_done($1)", [keys]);
    expect(await trash()).toEqual([]);
  });

  it("사진 행이 되살아난 키는 지우지 않는다 (백업 복구)", async () => {
    const [key] = await keysOf(PUBLISHED);
    await db.query("insert into private.storage_trash (storage_key, queued_at) values ($1, now() - interval '8 days')", [key]);
    expect(await due()).toEqual([]);
    expect(await trash()).toEqual([]);
  });

  it("7일 넘은 초안만 지운다 (게시물은 그대로)", async () => {
    expect((await db.query<{ n: number }>("select private.purge_stale_drafts() as n")).rows[0].n).toBe(0);
    await db.exec("update posts set created_at = now() - interval '8 days'");
    expect((await db.query<{ n: number }>("select private.purge_stale_drafts() as n")).rows[0].n).toBe(1);
    expect((await db.query("select id from posts")).rows).toEqual([{ id: PUBLISHED }]);
    expect(await trash()).toHaveLength(2);
  });

  it("API 역할은 정리 목록과 정리 함수에 접근할 수 없다", async () => {
    for (const sql of [
      "select * from private.storage_trash",
      "select * from private.storage_trash_due()",
      "select private.storage_trash_done(array['p/00000000000000000000000000000000'])",
      "select private.purge_stale_drafts()",
    ]) {
      await expect(asUser(db, AUTHOR, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});
