import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-0000000000e1";
const AUTHOR = "00000000-0000-4000-8000-0000000000e2";
const MODEL = "00000000-0000-4000-8000-0000000000e3";
const REPORTER = "00000000-0000-4000-8000-0000000000e4";
const POST = "60000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${MODEL}'), ('${REPORTER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'operator1', '운영', 'admin', true),
      ('${AUTHOR}', 'author1', '작가', 'member', true),
      ('${MODEL}', 'model1', '모델', 'member', false),
      ('${REPORTER}', 'reporter1', '신고', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '대상', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes, phash) values ('${POST}', 0, 100, 100, 1000, 170);
    insert into public.credits (post_id, role, member_id, status) values ('${POST}', 'model', '${MODEL}', 'pending');
  `);
});

/** 되돌리지 않는 세션으로 실행 (트리거가 남긴 알림을 확인하려고) */
async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const inbox = async (user: string) =>
  (
    await db.query<{ kind: string; actor_id: string | null; post_id: string | null }>(
      "select kind::text, actor_id, post_id from notifications where recipient_id = $1 order by id",
      [user],
    )
  ).rows;

const publish = () => as(AUTHOR, "update posts set status = 'published' where id = $1", [POST]);

describe("알림", () => {
  it("초안의 크레딧 요청은 게시될 때 알린다", async () => {
    expect(await inbox(MODEL)).toEqual([]);
    await publish();
    expect(await inbox(MODEL)).toEqual([{ kind: "credit_requested", actor_id: AUTHOR, post_id: POST }]);
  });

  it("크레딧 승인 · 거절은 작성자에게 알린다", async () => {
    await publish();
    await as(MODEL, "update credits set status = 'approved' where member_id = $1", [MODEL]);
    expect(await inbox(AUTHOR)).toEqual([{ kind: "credit_approved", actor_id: MODEL, post_id: POST }]);
  });

  it("운영자 임시조치 · 해제 · 게시 중단을 작성자에게 알린다", async () => {
    await publish();
    await as(ADMIN, "select public.moderate_post($1, 'hold', '확인 중')", [POST]);
    await as(ADMIN, "select public.moderate_post($1, 'release', '문제 없음')", [POST]);
    await as(ADMIN, "select public.moderate_post($1, 'hide', '권리 침해')", [POST]);
    expect((await inbox(AUTHOR)).map((n) => n.kind)).toEqual(["post_held", "post_released", "post_hidden"]);
  });

  it("작성자가 스스로 숨기면 알리지 않는다", async () => {
    await publish();
    await as(AUTHOR, "update posts set status = 'hidden' where id = $1", [POST]);
    expect(await inbox(AUTHOR)).toEqual([]);
  });

  it("신고 검토가 끝나면 신고자에게 알린다 (결과는 담지 않는다)", async () => {
    await publish();
    await as(REPORTER, "insert into reports (reporter_id, post_id, reason) values ($1, $2, 'spam')", [REPORTER, POST]);
    await as(ADMIN, "select public.moderate_post($1, 'dismiss', '해당 없음')", [POST]);
    expect(await inbox(REPORTER)).toEqual([{ kind: "report_reviewed", actor_id: null, post_id: POST }]);
  });

  it("남의 알림은 보거나 고칠 수 없고, 알림을 직접 만들 수 없다", async () => {
    await publish();
    const seen = await asUser(db, AUTHOR, (tx) => tx.query("select 1 from notifications"));
    expect(seen.rows).toHaveLength(0);
    const touched = await asUser(db, AUTHOR, (tx) => tx.query("update notifications set read_at = now() returning id"));
    expect(touched.rows).toHaveLength(0);
    await expect(
      asUser(db, AUTHOR, (tx) =>
        tx.query("insert into notifications (recipient_id, kind) values ($1, 'post_hidden')", [MODEL]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, MODEL, (tx) => tx.query("update notifications set kind = 'post_hidden'")),
    ).rejects.toThrow(/permission denied/);
  });

  it("본인은 읽음 처리할 수 있다", async () => {
    await publish();
    const updated = await asUser(db, MODEL, (tx) =>
      tx.query("update notifications set read_at = now() where read_at is null returning id"),
    );
    expect(updated.rows).toHaveLength(1);
  });

  it("오래된 알림을 지운다 (읽음 90일 · 안 읽음 180일)", async () => {
    await publish();
    await db.exec("update notifications set created_at = now() - interval '100 days'");
    expect((await db.query<{ n: number }>("select private.purge_old_notifications() as n")).rows[0].n).toBe(0);
    await db.exec("update notifications set read_at = now()");
    expect((await db.query<{ n: number }>("select private.purge_old_notifications() as n")).rows[0].n).toBe(1);
  });
});
