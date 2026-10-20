import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-0000000000e1";
const MOD = "00000000-0000-4000-8000-0000000000e2";
const R1 = "00000000-0000-4000-8000-0000000000e3";
const R2 = "00000000-0000-4000-8000-0000000000e4";
const R3 = "00000000-0000-4000-8000-0000000000e5";
const R4 = "00000000-0000-4000-8000-0000000000e6";
const POST = "30000000-0000-4000-8000-0000000000e1";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MOD}'), ('${R1}'), ('${R2}'), ('${R3}'), ('${R4}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'op_one', '운영', 'admin', true),
      ('${MOD}', 'mod_one', '도우미', 'moderator', true),
      ('${R1}', 'rep_one', '일', 'member', true),
      ('${R2}', 'rep_two', '이', 'member', false),
      ('${R3}', 'rep_three', '삼', 'member', false),
      ('${R4}', 'rep_four', '사', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${R1}', '대상', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id = '${POST}';
  `);
});

async function report(user: string, reason: string) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    await db.query("insert into public.reports (reporter_id, post_id, reason, detail) values ($1, $2, $3, '')", [user, POST, reason]);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const alerts = async (kind: string) =>
  (await db.query<{ recipient_id: string }>("select recipient_id from notifications where kind::text = $1 order by recipient_id", [kind])).rows.map((r) => r.recipient_id);

describe("운영자 알림", () => {
  it("긴급 사유 신고는 운영진에게 바로 (같은 글은 1시간에 한 번)", async () => {
    await report(R2, "minor_safety");
    expect(await alerts("admin_urgent")).toEqual([ADMIN, MOD]);
    // 미성년자 신고는 자동으로 숨겨지기도 하지만(같은 글) 알림은 한 번만
    await db.query("select private.notify_staff_urgent($1, false)", [POST]);
    expect(await alerts("admin_urgent")).toHaveLength(2);
  });

  it("보통 사유 신고는 바로 알리지 않고, 3명이 신고해 자동으로 숨겨지면 알린다", async () => {
    await report(R2, "spam");
    await report(R3, "spam");
    expect(await alerts("admin_urgent")).toEqual([]);
    await report(R4, "spam");
    expect(await alerts("admin_urgent")).toEqual([ADMIN, MOD]);
  });

  it("소명은 최고 관리자에게만", async () => {
    await db.query("update public.posts set held_at = now(), held_reason = 'manual' where id = $1", [POST]);
    await db.query("insert into public.appeals (post_id, author_id, statement) values ($1, $2, '동의를 받은 사진이에요 확인 부탁드려요')", [POST, R1]);
    expect(await alerts("admin_urgent")).toEqual([ADMIN]);
  });

  it("받지 않음으로 고르면 오지 않는다 (본인 설정만 바꾼다)", async () => {
    await asUser(db, MOD, (tx) => tx.query("insert into admin_alert_settings (user_id, mode) values ($1, 'off')", [MOD]));
    await db.query("insert into public.admin_alert_settings (user_id, mode) values ($1, 'off')", [MOD]);
    await report(R2, "deepfake");
    expect(await alerts("admin_urgent")).toEqual([ADMIN]);
    await expect(asUser(db, R1, (tx) => tx.query("insert into admin_alert_settings (user_id, mode) values ($1, 'all')", [R1]))).rejects.toThrow(/row-level security/);
  });

  it("하루 요약은 남은 일이 있을 때만 · '긴급만'이면 빼고 · 운영 도우미는 신고가 있을 때만", async () => {
    expect((await db.query<{ n: number }>("select private.admin_daily_digest() as n")).rows[0]!.n).toBe(0);
    await db.query("insert into public.inquiries (author_id, category, body) values ($1, 'other', '문의가 있어요 확인해 주세요')", [R1]);
    expect((await db.query<{ n: number }>("select private.admin_daily_digest() as n")).rows[0]!.n).toBe(1);
    expect(await alerts("admin_digest")).toEqual([ADMIN]);
    await report(R2, "spam");
    await db.query("insert into public.admin_alert_settings (user_id, mode) values ($1, 'urgent')", [ADMIN]);
    expect((await db.query<{ n: number }>("select private.admin_daily_digest() as n")).rows[0]!.n).toBe(1);
    expect(await alerts("admin_digest")).toEqual([ADMIN, MOD]);
  });
});
