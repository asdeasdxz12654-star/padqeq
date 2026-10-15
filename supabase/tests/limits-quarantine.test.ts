import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002301";
const AUTHOR = "00000000-0000-4000-8000-000000002302";
const R1 = "00000000-0000-4000-8000-000000002303";
const R2 = "00000000-0000-4000-8000-000000002304";
const R3 = "00000000-0000-4000-8000-000000002305";
const POST = "f2300000-0000-4000-8000-000000000001";
const OLD_POSTS = Array.from({ length: 6 }, (_, i) => `f2300000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${R1}'), ('${R2}'), ('${R3}');
    insert into public.profiles (id, handle, display_name, role, can_upload, created_at) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true, now() - interval '1 year'),
      ('${AUTHOR}', 'author1', '작가', 'member', true, now() - interval '1 year'),
      ('${R1}', 'rep1', '신고1', 'member', false, now() - interval '1 year'),
      ('${R2}', 'rep2', '신고2', 'member', false, now() - interval '1 year'),
      ('${R3}', 'rep3', '신고3', 'member', false, now() - interval '1 year');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '야간', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes, phash) values ('${POST}', 0, 100, 100, 1000, 1234567);
    update public.posts set status = 'published';
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

/** 사진은 업로드 함수(security definer)가 넣는다: 권한 검사 없이, 요청한 회원만 정해서 */
async function asOwner(user: string, sql: string) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query(sql);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const report = (who: string, post = POST) =>
  as(who, "insert into public.reports (reporter_id, post_id, reason) values ($1, $2, 'other')", [who, post]);
const held = async () => (await db.query<{ held_at: string | null }>(`select held_at from public.posts where id = '${POST}'`)).rows[0]!.held_at;

describe("한도 값", () => {
  it("운영자만 범위 안에서 사유와 함께 바꾸고 감사 로그에 남는다", async () => {
    await expect(as(R1, "select set_site_limit('report_daily', 5, '조정')")).rejects.toThrow(/admin_only/);
    await expect(as(ADMIN, "select set_site_limit('report_daily', 999, '조정')")).rejects.toThrow(/limit_out_of_range/);
    await expect(as(ADMIN, "select set_site_limit('report_daily', 5, '')")).rejects.toThrow(/note_required/);
    await expect(as(ADMIN, "select set_site_limit('nope', 5, '조정')")).rejects.toThrow(/limit_not_found/);
    await as(ADMIN, "select set_site_limit('report_daily', 1, '신고 폭주')");
    const log = await db.query("select detail from private.audit_log where action = 'site_limit'");
    expect(log.rows).toEqual([{ detail: { key: "report_daily", from: 20, to: 1, note: "신고 폭주" } }]);
    // 바꾼 값이 바로 적용된다
    await report(R1);
    await db.exec(`insert into public.posts (id, author_id, title, category, shot_year, has_people, status)
      select '${OLD_POSTS[0]}', '${AUTHOR}', '둘', 'landscape', 2026, false, 'draft'`);
    await expect(report(R1, OLD_POSTS[0])).rejects.toThrow();
  });

  it("자동 임시 비공개 인원을 바꿀 수 있다", async () => {
    await as(ADMIN, "select set_site_limit('auto_hold_reporters', 2, '빠르게')");
    await report(R1);
    expect(await held()).toBeNull();
    await report(R2);
    expect(await held()).not.toBeNull();
  });

  it("회원별 한 달 업로드 한도 (운영자 제외)", async () => {
    await as(ADMIN, "select set_site_limit('monthly_upload_photos', 2, '시험')");
    await expect(
      asOwner(AUTHOR, `insert into public.photos (post_id, position, width, height, bytes, phash) values ('${POST}', 1, 100, 100, 1000, 2345678)`),
    ).resolves.toBeDefined();
    await expect(
      asOwner(AUTHOR, `insert into public.photos (post_id, position, width, height, bytes, phash) values ('${POST}', 2, 100, 100, 1000, 3456789)`),
    ).rejects.toThrow(/monthly_upload_limit/);
    const quota = await as(AUTHOR, "select * from my_upload_quota()");
    expect(quota.rows[0]).toEqual({ used: 2, quota: 2 });
  });
});

describe("허위 신고 이력", () => {
  it("기각이 많은 신고자는 자동 임시 비공개 인원에 세지 않는다", async () => {
    // R1: 지난 신고 6건이 모두 기각
    for (const [i, id] of OLD_POSTS.entries()) {
      await db.exec(`insert into public.posts (id, author_id, title, category, shot_year, has_people) values ('${id}', '${AUTHOR}', '옛 ${i}', 'landscape', 2026, false);
        insert into public.reports (reporter_id, post_id, reason, status, resolved_at) values ('${R1}', '${id}', 'other', 'dismissed', now());`);
    }
    await report(R1);
    await report(R2);
    expect(await held()).toBeNull();
    await report(R3);
    expect(await held()).toBeNull();
    const stats = await as(ADMIN, "select reporter_id, total, dismissed, unreliable from admin_reporter_stats($1::uuid[]) order by total desc", [[R1, R2]]);
    expect(stats.rows[0]).toEqual({ reporter_id: R1, total: 7, dismissed: 6, unreliable: true });
    expect(stats.rows[1]).toMatchObject({ reporter_id: R2, unreliable: false });
    await expect(as(R2, "select * from admin_reporter_stats($1::uuid[])", [[R1]])).rejects.toThrow(/admin_only/);
  });
});

describe("불법 촬영물 격리", () => {
  const act = (action: string) =>
    as(ADMIN, "select admin_posts_action($1::uuid[], $2, '수사 협조') as n", [[POST], action]).then((r) => (r.rows[0] as { n: number }).n);

  it("격리하면 아무도 못 보고, 복구 · 영구 삭제 · 자동 삭제 · 작성자 삭제가 막힌다", async () => {
    await report(R1);
    expect(await act("quarantine")).toBe(1);
    const row = (await db.query<Record<string, unknown>>(`select status, trashed_at, quarantined_at, removed_at from public.posts where id = '${POST}'`)).rows[0]!;
    expect(row.status).toBe("hidden");
    expect(row.trashed_at).not.toBeNull();
    expect(row.removed_at).not.toBeNull();
    expect((await db.query("select 1 from private.blocked_photo_hashes")).rows.length).toBeGreaterThan(0);
    expect((await db.query("select status from public.reports")).rows).toEqual([{ status: "actioned" }]);

    expect(await act("untrash")).toBe(0);
    expect(await act("purge")).toBe(0);
    await db.exec(`alter table public.posts disable trigger posts_guard_trashed; update public.posts set trashed_at = now() - interval '60 days'; alter table public.posts enable trigger posts_guard_trashed;`);
    expect((await db.query<{ n: number }>("select private.purge_trashed_posts() as n")).rows[0]!.n).toBe(0);
    await expect(db.exec(`delete from public.posts where id = '${POST}'`)).rejects.toThrow(/post_quarantined/);
  });

  it("격리를 풀면 휴지통에 남고 30일을 다시 센다", async () => {
    await act("quarantine");
    expect(await act("unquarantine")).toBe(1);
    const row = (await db.query<{ quarantined_at: string | null; recent: boolean }>(
      `select quarantined_at, trashed_at > now() - interval '1 minute' as recent from public.posts where id = '${POST}'`,
    )).rows[0]!;
    expect(row).toEqual({ quarantined_at: null, recent: true });
    expect(await act("purge")).toBe(1);
  });
});
