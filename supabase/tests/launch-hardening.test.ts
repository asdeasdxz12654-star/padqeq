import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002201";
const AUTHOR = "00000000-0000-4000-8000-000000002202";
const REPORTER = "00000000-0000-4000-8000-000000002203";
const POST = "f8000000-0000-4000-8000-000000000001";
const DRAFT = "f8000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${REPORTER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true), ('${AUTHOR}', 'author1', '작가', 'member', true),
      ('${REPORTER}', 'reporter1', '신고자', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false), ('${DRAFT}', '${AUTHOR}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes, phash) values
      ('${POST}', 0, 100, 100, 1000, ('x' || 'f0f0f0f0f0f0f0f0')::bit(64)::bigint);
    insert into public.photos (post_id, position, width, height, bytes) values ('${DRAFT}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id = '${POST}';
  `);
});

/** 되돌리지 않고 실행. aal을 주면 그 세션으로 (기본 aal2) */
async function as<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = [], aal = "aal2") {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ aal })]);
    const result = await db.query<T>(sql, params);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

describe("운영자 2단계 인증", () => {
  it("2단계 인증을 마치지 않은 운영자 세션은 운영자 권한이 없다", async () => {
    const seesDraft = async (aal: string) => (await as(ADMIN, "select 1 from posts where id = $1", [DRAFT], aal)).rows.length;
    expect(await seesDraft("aal2")).toBe(1);
    expect(await seesDraft("aal1")).toBe(0);
    await expect(as(ADMIN, "select moderate_post($1, 'hold', '사유')", [POST], "aal1")).rejects.toThrow(/admin_only/);
    await as(ADMIN, "select moderate_post($1, 'hold', '사유')", [POST], "aal2");
  });
});

describe("신고 증거", () => {
  const report = (reason: string) =>
    as<{ id: string }>(REPORTER, "insert into reports (reporter_id, post_id, reason) values (auth.uid(), $1, $2) returning id", [POST, reason]).then(
      (r) => r.rows[0]!.id,
    );

  it("초상권 · 저작권 신고에만 붙인다", async () => {
    const spam = await report("spam");
    await expect(as(REPORTER, "select * from add_report_evidence($1, 'image/png', 100)", [spam])).rejects.toThrow(/evidence_not_allowed/);
    await db.exec("delete from reports");
    const portrait = await report("portrait_rights");
    await as(REPORTER, "select * from add_report_evidence($1, 'image/png', 100)", [portrait]);
  });

  it("처리하고 90일이 지나면 증거를 지우고 파일 정리 목록에 올린다", async () => {
    const id = await report("copyright");
    await as(REPORTER, "select * from add_report_evidence($1, 'image/png', 100)", [id]);
    await as(ADMIN, "select moderate_post($1, 'dismiss', '문제 없음')", [POST]);
    expect((await db.query<{ n: number }>("select private.purge_old_evidence() as n")).rows[0]!.n).toBe(0);
    await db.exec("update reports set resolved_at = now() - interval '91 days'");
    expect((await db.query<{ n: number }>("select private.purge_old_evidence() as n")).rows[0]!.n).toBe(1);
    expect((await db.query("select 1 from private.storage_trash")).rows).toHaveLength(1);
    expect((await db.query("select 1 from reports")).rows).toHaveLength(1);
  });
});

describe("사진 지문", () => {
  const setHash = (hash: string) =>
    as(AUTHOR, "select set_photo_hashes($1, (select jsonb_agg(jsonb_build_object('photo_id', id, 'hash', $2::text)) from photos where post_id = $1))", [
      DRAFT,
      hash,
    ]);
  const publish = () => as(AUTHOR, "update posts set status = 'published' where id = $1", [DRAFT]);

  it("지문이 없으면 게시할 수 없다", async () => {
    await expect(publish()).rejects.toThrow(/photo_hash_missing/);
    await setHash("0123456789abcdef");
    await publish();
  });

  it("운영자가 게시 중단한 사진과 비슷하면 다시 올릴 수 없고, 복구하면 풀린다", async () => {
    await as(ADMIN, "select moderate_post($1, 'hide', '불법 촬영')", [POST]);
    // 3비트만 다른 지문 → 차단
    await expect(setHash("f0f0f0f0f0f0f0f7")).rejects.toThrow(/photo_blocked/);
    await setHash("0f0f0f0f0f0f0f0f");
    await as(ADMIN, "select moderate_post($1, 'restore', '오인 신고')", [POST]);
    await setHash("f0f0f0f0f0f0f0f7");
  });

  it("이미 올린 내 사진과 비슷한지 알려 준다", async () => {
    const rows = await asUser(db, AUTHOR, (tx) =>
      tx.query<{ idx: number; post_id: string | null }>("select * from my_similar_photos($1) order by idx", [["f0f0f0f0f0f0f0f1", "0000000000000000", "bad"]]),
    );
    expect(rows.rows).toEqual([
      { idx: 1, post_id: POST },
      { idx: 2, post_id: null },
    ]);
  });

  it("공개된 사진의 지문은 바꿀 수 없다", async () => {
    await expect(
      as(AUTHOR, "select set_photo_hashes($1, (select jsonb_agg(jsonb_build_object('photo_id', id, 'hash', '0000000000000000')) from photos where post_id = $1))", [POST]),
    ).rejects.toThrow(/photo_not_in_post/);
  });
});
