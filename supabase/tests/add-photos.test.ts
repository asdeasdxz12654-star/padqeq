import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000000e01";
const OTHER = "00000000-0000-4000-8000-000000000e02";
const ADMIN = "00000000-0000-4000-8000-000000000e03";
const POST = "c0000000-0000-4000-8000-000000000001";
const SEED = "0123456789abcdef0123456789abcdef";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${OTHER}'), ('${ADMIN}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${AUTHOR}', 'author1', '작가', 'member', true),
      ('${OTHER}', 'other1', '남', 'member', true),
      ('${ADMIN}', 'operator1', '운영', 'admin', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published';
  `);
});

async function as<T>(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const entry = (n = 1) => JSON.stringify(Array.from({ length: n }, () => ({ width: 100, height: 100, bytes: 1000, seed: SEED })));
const add = (user: string, n = 1) =>
  as<{ ids: string[] }>(user, "select public.add_my_photos($1, $2::jsonb) as ids", [POST, entry(n)]).then((r) => r[0]!.ids);
const visibleTo = async (user: string | null) =>
  (await asUser(db, user, (tx) => tx.query("select 1 from photos where post_id = $1", [POST]))).rows.length;

describe("게시된 글에 사진 추가", () => {
  it("파일이 다 올라가기 전에는 작성자 · 운영자만 보고, 완료하면 모두 본다", async () => {
    const [id] = await add(AUTHOR);
    expect((await db.query<{ position: number }>("select position from photos where id = $1", [id])).rows[0]!.position).toBe(1);
    expect((await db.query("select 1 from private.photo_watermarks where photo_id = $1", [id])).rows).toHaveLength(1);
    expect(await visibleTo(null)).toBe(1);
    expect(await visibleTo(AUTHOR)).toBe(2);
    expect(await visibleTo(ADMIN)).toBe(2);
    await expect(as(AUTHOR, "select public.finish_my_photos($1, $2::uuid[])", [POST, [id]])).rejects.toThrow(/photo_hash_missing/);
    await as(AUTHOR, "select public.set_photo_hashes($1, $2::jsonb)", [POST, JSON.stringify([{ photo_id: id, hash: "00000000000000aa" }])]);
    await as(AUTHOR, "select public.finish_my_photos($1, $2::uuid[])", [POST, [id]]);
    expect(await visibleTo(null)).toBe(2);
  });

  it("남의 글 · 운영자가 게시 중단한 글에는 추가할 수 없다", async () => {
    await expect(add(OTHER)).rejects.toThrow(/post_not_editable/);
    await db.exec(`update posts set status = 'hidden', removed_at = now() where id = '${POST}'`);
    await expect(add(AUTHOR)).rejects.toThrow(/post_not_editable/);
  });

  it("사람이 나오는 글은 운영자만 추가한다", async () => {
    await db.exec(`update posts set has_people = true where id = '${POST}'`);
    await expect(add(AUTHOR)).rejects.toThrow(/people_admin_only/);
  });

  it("게시물당 20장까지", async () => {
    await add(AUTHOR, 19);
    await expect(add(AUTHOR)).rejects.toThrow(/photo_limit/);
  });

  it("남이 완료 처리할 수 없다", async () => {
    const [id] = await add(AUTHOR);
    await expect(as(OTHER, "select public.finish_my_photos($1, $2::uuid[])", [POST, [id]])).rejects.toThrow(/post_not_found/);
  });

  it("하루 넘게 다 올라가지 않은 사진은 정리한다", async () => {
    const [id] = await add(AUTHOR);
    await db.query("update photos set created_at = now() - interval '2 days' where id = $1", [id]);
    await db.query("select private.purge_stale_drafts()");
    expect((await db.query("select 1 from photos where id = $1", [id])).rows).toHaveLength(0);
    expect((await db.query("select 1 from photos where post_id = $1", [POST])).rows).toHaveLength(1);
  });

  it("초안은 게시할 때 사진이 함께 공개된다", async () => {
    const draft = "c0000000-0000-4000-8000-000000000002";
    await db.exec(`
      insert into public.posts (id, author_id, title, category, shot_year, has_people) values ('${draft}', '${AUTHOR}', '초안', 'landscape', 2026, false);
      insert into public.photos (post_id, position, width, height, bytes) values ('${draft}', 0, 100, 100, 1000);
    `);
    expect((await db.query("select ready_at from photos where post_id = $1", [draft])).rows).toEqual([{ ready_at: null }]);
    await db.exec(`update posts set status = 'published' where id = '${draft}'`);
    expect((await db.query("select 1 from photos where post_id = $1 and ready_at is not null", [draft])).rows).toHaveLength(1);
  });
});
