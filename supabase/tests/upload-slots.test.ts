import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000002601";
const OTHER = "00000000-0000-4000-8000-000000002602";
const ADMIN = "00000000-0000-4000-8000-000000002603";
const VIEWER = "00000000-0000-4000-8000-000000002604";
const DRAFT = "fc000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${OTHER}'), ('${ADMIN}'), ('${VIEWER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${AUTHOR}', 'author1', '작가', 'member', true),
      ('${OTHER}', 'other1', '남', 'member', true),
      ('${ADMIN}', 'operator1', '운영', 'admin', true),
      ('${VIEWER}', 'viewer1', '구경', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${DRAFT}', '${AUTHOR}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${DRAFT}', 0, 100, 100, 1000);
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

const reserve = (user: string, w = 100, h = 100, bytes = 1000) =>
  as<{ id: string }>(user, "select public.reserve_upload_slot($1, $2, $3) as id", [w, h, bytes]).then((r) => r[0]!.id);
const photoId = async () => (await db.query<{ id: string }>("select id from photos where post_id = $1", [DRAFT])).rows[0]!.id;
const attach = (user: string, photo: string, slot: string) =>
  as(user, "select public.attach_upload_slots($1, $2::jsonb)", [DRAFT, JSON.stringify([{ photo_id: photo, slot_id: slot }])]);
const trash = async () => (await db.query<{ storage_key: string }>("select storage_key from private.storage_trash")).rows.map((r) => r.storage_key);

describe("업로드 자리", () => {
  it("업로드 권한이 있어야 받고, 본인 것만 본다", async () => {
    await expect(reserve(VIEWER)).rejects.toThrow(/upload_not_allowed/);
    const slot = await reserve(AUTHOR);
    expect(await as(AUTHOR, "select id from upload_slots")).toEqual([{ id: slot }]);
    expect(await as(OTHER, "select id from upload_slots")).toEqual([]);
    await expect(as(AUTHOR, "insert into upload_slots (owner_id, width, height, bytes) values (auth.uid(), 1, 1, 1)")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("사진 기준을 벗어난 크기는 받지 않는다", async () => {
    await expect(reserve(AUTHOR, 6000, 4000, 1000)).rejects.toThrow(/upload_slot_size_rules/);
  });

  it("초안 사진에 붙이면 저장 위치가 옮겨지고 자리는 사라진다 (파일 정리 대상이 아님)", async () => {
    const slot = await reserve(AUTHOR);
    const key = (await db.query<{ storage_key: string }>("select storage_key from upload_slots where id = $1", [slot])).rows[0]!.storage_key;
    const photo = await photoId();
    await attach(AUTHOR, photo, slot);
    expect((await db.query<{ storage_key: string }>("select storage_key from photos where id = $1", [photo])).rows[0]!.storage_key).toBe(key);
    expect((await db.query("select 1 from upload_slots")).rows).toHaveLength(0);
    expect(await trash()).not.toContain(key);
  });

  it("남의 자리 · 남의 초안 · 크기가 다른 자리는 붙일 수 없다", async () => {
    const photo = await photoId();
    const others = await reserve(OTHER);
    await expect(attach(AUTHOR, photo, others)).rejects.toThrow(/slot_not_found/);
    await expect(attach(OTHER, photo, others)).rejects.toThrow(/post_not_found/);
    const wrong = await reserve(AUTHOR, 100, 100, 999);
    await expect(attach(AUTHOR, photo, wrong)).rejects.toThrow(/slot_mismatch/);
    await db.exec(`update public.posts set status = 'published' where id = '${DRAFT}'`);
    const ok = await reserve(AUTHOR);
    await expect(attach(AUTHOR, photo, ok)).rejects.toThrow(/post_not_found/);
  });

  it("버린 자리 · 오래된 자리는 지우고 파일을 정리 대상으로 넘긴다", async () => {
    const a = await reserve(AUTHOR);
    const b = await reserve(AUTHOR);
    expect(await as<{ n: number }>(OTHER, "select public.discard_upload_slots($1) as n", [[a]])).toEqual([{ n: 0 }]);
    expect(await as<{ n: number }>(AUTHOR, "select public.discard_upload_slots($1) as n", [[a]])).toEqual([{ n: 1 }]);
    expect(await trash()).toHaveLength(1);
    await db.exec(`update public.upload_slots set created_at = now() - interval '4 days' where id = '${b}'`);
    expect((await db.query<{ n: number }>("select private.purge_stale_upload_slots() as n")).rows[0]!.n).toBe(1);
    expect(await trash()).toHaveLength(2);
  });

  it("운영자가 아니면 이번 달 한도에 들고 있는 자리도 센다", async () => {
    await db.exec(`update public.site_limits set value = 3 where key = 'monthly_upload_photos'`);
    await reserve(AUTHOR);
    await reserve(AUTHOR);
    await expect(reserve(AUTHOR)).rejects.toThrow(/monthly_upload_limit/);
    expect(await as(AUTHOR, "select used, quota from my_upload_quota()")).toEqual([{ used: 3, quota: 3 }]);
    for (let i = 0; i < 4; i++) await reserve(ADMIN);
  });
});
