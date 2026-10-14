import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000001401";
const AUTHOR = "00000000-0000-4000-8000-000000001402";
const REPORTER = "00000000-0000-4000-8000-000000001403";
const OTHER = "00000000-0000-4000-8000-000000001404";
const POST = "f3000000-0000-4000-8000-000000000001";
const REPORT = "f3100000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${REPORTER}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true), ('${AUTHOR}', 'author1', '작성자', 'member', true),
      ('${REPORTER}', 'reporter1', '신고자', 'member', false), ('${OTHER}', 'other1', '남', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published';
    insert into public.reports (id, reporter_id, post_id, reason) values ('${REPORT}', '${REPORTER}', '${POST}', 'copyright');
  `);
});

const add = (user: string, type = "image/jpeg", bytes = 5000) =>
  asUser(db, user, (tx) =>
    tx.query<{ id: string; storage_key: string }>("select * from add_report_evidence($1, $2, $3)", [REPORT, type, bytes]),
  );

/** 되돌리지 않고 신고자로 실행 */
async function asReporter<T>(run: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [REPORTER]);
    const result = await run();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

describe("신고 증거", () => {
  it("내 처리 대기 신고에만 붙인다", async () => {
    const row = (await add(REPORTER)).rows[0]!;
    expect(row.storage_key).toMatch(/^e\/[0-9a-f]{32}$/);
    await expect(add(OTHER)).rejects.toThrow(/report_not_found/);
    await expect(add(AUTHOR)).rejects.toThrow(/report_not_found/);
    await db.exec(`update reports set status = 'dismissed' where id = '${REPORT}'`);
    await expect(add(REPORTER)).rejects.toThrow(/report_not_found/);
  });

  it("형식 · 용량 · 3장 제한", async () => {
    await expect(add(REPORTER, "image/gif")).rejects.toThrow(/evidence_invalid/);
    await expect(add(REPORTER, "image/png", 10 * 1024 * 1024 + 1)).rejects.toThrow(/evidence_invalid/);
    await asReporter(async () => {
      for (const type of ["image/jpeg", "image/png", "image/webp"]) await db.query("select add_report_evidence($1, $2, 100)", [REPORT, type]);
    });
    await expect(add(REPORTER)).rejects.toThrow(/evidence_limit/);
  });

  it("직접 넣거나 고칠 수 없다", async () => {
    await expect(
      asUser(db, REPORTER, (tx) =>
        tx.query("insert into report_evidence (report_id, storage_key, content_type, bytes) values ($1, 'e/00000000000000000000000000000000', 'image/png', 1)", [REPORT]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("신고자 본인과 운영자만 본다 · 완료는 신고자만", async () => {
    const { id } = await asReporter(async () => (await db.query<{ id: string }>("select id from add_report_evidence($1, 'image/png', 100)", [REPORT])).rows[0]!);
    const seen = async (user: string) => (await asUser(db, user, (tx) => tx.query("select id from report_evidence"))).rows.length;
    expect([await seen(REPORTER), await seen(ADMIN), await seen(AUTHOR), await seen(OTHER)]).toEqual([1, 1, 0, 0]);

    const finish = (user: string) =>
      asUser(db, user, async (tx) => (await tx.query<{ ok: boolean }>("select finish_report_evidence($1) as ok", [id])).rows[0]!.ok);
    expect(await finish(OTHER)).toBe(false);
    expect(await finish(REPORTER)).toBe(true);
  });

  it("올리다 그만둔 증거는 하루 뒤 지우고, 신고가 지워지면 파일 정리 목록에 오른다", async () => {
    const keys = await asReporter(async () => [
      (await db.query<{ storage_key: string }>("select storage_key from add_report_evidence($1, 'image/png', 100)", [REPORT])).rows[0]!.storage_key,
      (await db.query<{ storage_key: string }>("select storage_key from add_report_evidence($1, 'image/png', 100)", [REPORT])).rows[0]!.storage_key,
    ]);
    await db.query("update report_evidence set uploaded_at = now() where storage_key = $1", [keys[0]]);
    await db.exec("update report_evidence set created_at = now() - interval '2 days'");
    expect((await db.query<{ n: number }>("select private.purge_stale_evidence() as n")).rows[0]!.n).toBe(1);

    await db.query("delete from reports where id = $1", [REPORT]);
    const trash = (await db.query<{ storage_key: string }>("select storage_key from private.storage_trash order by storage_key")).rows.map((r) => r.storage_key);
    expect(trash.sort()).toEqual([...keys].sort());

    await db.exec("update private.storage_trash set queued_at = now() - interval '8 days'");
    expect((await db.query<{ k: string }>("select k from private.storage_trash_due() as k")).rows).toHaveLength(2);
  });
});
