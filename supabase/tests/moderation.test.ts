import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-0000000000b1";
const R1 = "00000000-0000-4000-8000-0000000000b2";
const R2 = "00000000-0000-4000-8000-0000000000b3";
const R3 = "00000000-0000-4000-8000-0000000000b4";
const POST = "30000000-0000-4000-8000-000000000001";

let db: PGlite;

// 신고는 상태가 쌓이므로 테스트마다 새 DB
beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${R1}'), ('${R2}'), ('${R3}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'operator1', '운영', 'admin', true),
      ('${R1}', 'reporter1', '일', 'member', false),
      ('${R2}', 'reporter2', '이', 'member', false),
      ('${R3}', 'reporter3', '삼', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${ADMIN}', '대상', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id = '${POST}';
  `);
});

/** 신고는 실제로 남아야 하므로 되돌리지 않는 세션으로 넣는다 */
async function report(user: string, reason: string, detail = "") {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    await db.query("insert into public.reports (reporter_id, post_id, reason, detail) values ($1, $2, $3, $4)", [user, POST, reason, detail]);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const visibleToPublic = async () => (await asUser(db, null, (tx) => tx.query("select 1 from posts where id = $1", [POST]))).rows.length === 1;
const held = async () => (await db.query<{ held_reason: string | null }>("select held_reason from posts where id = $1", [POST])).rows[0]?.held_reason;

describe("신고", () => {
  it("미성년자 신고는 접수 즉시 임시 비공개", async () => {
    await report(R1, "minor_safety");
    expect(await held()).toBe("auto:minor_safety");
    expect(await visibleToPublic()).toBe(false);
    // 작성자(운영자)는 계속 본다
    expect((await asUser(db, ADMIN, (tx) => tx.query("select 1 from posts where id = $1", [POST]))).rows).toHaveLength(1);
  });

  it("서로 다른 3명이 신고하면 임시 비공개 (2명까지는 공개 유지)", async () => {
    await report(R1, "spam");
    await report(R2, "deepfake");
    expect(await visibleToPublic()).toBe(true);
    await report(R3, "voyeurism");
    expect(await held()).toBe("auto:multiple_reports");
  });

  it("같은 글을 두 번 신고할 수 없다", async () => {
    await report(R1, "spam");
    await expect(report(R1, "other")).rejects.toThrow(/reports_one_open_per_reporter/);
  });

  it("내 글 · 남의 이름으로는 신고할 수 없다", async () => {
    await expect(report(ADMIN, "spam")).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, R1, (tx) => tx.query("insert into reports (reporter_id, post_id, reason) values ($1, $2, 'spam')", [R2, POST])),
    ).rejects.toThrow(/row-level security/);
  });

  it("신고 상태는 직접 바꿀 수 없다", async () => {
    await report(R1, "spam");
    await expect(asUser(db, ADMIN, (tx) => tx.query("update reports set status = 'dismissed'"))).rejects.toThrow(/permission denied/);
  });

  it("회원은 임시 비공개를 직접 풀 수 없다", async () => {
    await report(R1, "minor_safety");
    await expect(
      asUser(db, ADMIN, (tx) => tx.query("update posts set held_at = null where id = $1", [POST])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("운영자 조치", () => {
  const moderate = (user: string, decision: string, note: string) =>
    asUser(db, user, async (tx) => {
      await tx.query("select public.moderate_post($1, $2, $3)", [POST, decision, note]);
      const post = await tx.query<{ status: string; held_reason: string | null }>("select status::text, held_reason from posts where id = $1", [POST]);
      const reports = await tx.query<{ status: string }>("select status::text from reports where post_id = $1", [POST]);
      return { post: post.rows[0], reports: reports.rows.map((r) => r.status) };
    });

  it("기각하면 신고가 닫히고 자동 임시 비공개가 풀린다", async () => {
    await report(R1, "minor_safety");
    expect(await moderate(ADMIN, "dismiss", "아동 아님 확인")).toEqual({
      post: { status: "published", held_reason: null },
      reports: ["dismissed"],
    });
  });

  it("게시 중단하면 숨김 + 신고 처리 완료", async () => {
    await report(R1, "portrait_rights");
    expect(await moderate(ADMIN, "hide", "본인 확인, 동의 철회")).toEqual({
      post: { status: "hidden", held_reason: null },
      reports: ["actioned"],
    });
  });

  it("내부 사유가 없거나 운영자가 아니면 거부", async () => {
    await expect(moderate(ADMIN, "hide", "  ")).rejects.toThrow(/note_required/);
    await expect(moderate(R1, "hide", "사유")).rejects.toThrow(/admin_only/);
    await expect(moderate(ADMIN, "delete_everything", "사유")).rejects.toThrow(/decision_invalid/);
  });

  it("조치는 감사 로그에 남는다", async () => {
    await report(R1, "spam");
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ADMIN}', false);`);
    await db.query("select public.moderate_post($1, 'hold', '소명 대기')", [POST]);
    await db.exec(`reset role;`);
    const log = await db.query<{ action: string; decision: string }>(
      "select action, detail->>'decision' as decision from private.audit_log where target_id = $1 and action = 'moderation'",
      [POST],
    );
    expect(log.rows).toEqual([{ action: "moderation", decision: "hold" }]);
  });
});
