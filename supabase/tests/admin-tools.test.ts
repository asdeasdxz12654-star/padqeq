import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002201";
const MEMBER = "00000000-0000-4000-8000-000000002202";
const OTHER = "00000000-0000-4000-8000-000000002203";
const POST = "f2200000-0000-4000-8000-000000000001";
const DRAFT = "f2200000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    alter table auth.users add column email text, add column raw_app_meta_data jsonb, add column last_sign_in_at timestamptz;
    insert into auth.users (id, email, raw_app_meta_data) values
      ('${ADMIN}', 'wolf@example.com', '{"provider":"email"}'),
      ('${MEMBER}', 'moonlight@gmail.com', '{"provider":"kakao"}'),
      ('${OTHER}', 'o@x.kr', null);
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true),
      ('${MEMBER}', 'member1', '회원', 'member', true),
      ('${OTHER}', 'other1', '남', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${MEMBER}', '야간 촬영', 'landscape', 2026, false),
      ('${DRAFT}', '${MEMBER}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published' where id = '${POST}';
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

const act = (ids: string[], action: string, user = ADMIN) =>
  as(user, "select admin_posts_action($1::uuid[], $2, '정리') as n", [ids, action]).then((r) => (r.rows[0] as { n: number }).n);
const post = async () =>
  (await db.query<{ status: string; trashed_at: string | null; removed_at: string | null }>(
    `select status, trashed_at, removed_at from public.posts where id = '${POST}'`,
  )).rows[0];

describe("휴지통 · 일괄 작업", () => {
  it("운영자만 할 수 있다", async () => {
    await expect(act([POST], "trash", MEMBER)).rejects.toThrow(/admin_only/);
  });

  it("휴지통 글은 작성자에게도 안 보이고 고칠 수 없다", async () => {
    expect(await act([POST, DRAFT], "trash")).toBe(2);
    expect((await post())!.status).toBe("hidden");
    const seen = await asUser(db, MEMBER, (tx) => tx.query("select id from public.posts"));
    expect(seen.rows).toHaveLength(0);
    await as(MEMBER, `update public.posts set title = '바꿈' where id = '${DRAFT}'`);
    expect((await db.query(`select title from public.posts where id = '${DRAFT}'`)).rows).toEqual([{ title: "초안" }]);
    await expect(
      asUser(db, MEMBER, (tx) => tx.query(`select private.post_is_visible('${POST}') as v`)),
    ).resolves.toMatchObject({ rows: [{ v: false }] });
  });

  it("복구하면 넣기 전 상태로 돌아간다", async () => {
    await act([POST], "trash");
    expect(await act([POST], "untrash")).toBe(1);
    expect(await post()).toMatchObject({ status: "published", trashed_at: null, removed_at: null });
  });

  it("영구 삭제는 휴지통 글만, 감사 로그가 남는다", async () => {
    expect(await act([POST], "purge")).toBe(0);
    await act([POST], "trash");
    expect(await act([POST], "purge")).toBe(1);
    expect((await db.query(`select 1 from public.posts where id = '${POST}'`)).rows).toHaveLength(0);
    const log = await db.query<{ action: string }>(`select action from private.audit_log where target_id = '${POST}' order by id`);
    expect(log.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["post_trash", "post_purge"]));
  });

  it("30일 지난 휴지통은 정리 작업이 비운다", async () => {
    await act([POST, DRAFT], "trash");
    await db.exec(`alter table public.posts disable trigger posts_guard_trashed; update public.posts set trashed_at = now() - interval '31 days' where id = '${POST}'; alter table public.posts enable trigger posts_guard_trashed;`);
    expect((await db.query<{ n: number }>("select private.purge_trashed_posts() as n")).rows[0]!.n).toBe(1);
    expect((await db.query("select 1 from public.posts")).rows).toHaveLength(1);
  });

  it("게시 중단 · 해제를 함께 할 수 있다", async () => {
    expect(await act([POST, DRAFT], "hide")).toBe(1);
    expect((await post())!.removed_at).not.toBeNull();
    expect(await act([POST], "restore")).toBe(1);
    expect(await post()).toMatchObject({ status: "published", removed_at: null });
  });

  it("사유 · 대상 수를 확인한다", async () => {
    await expect(as(ADMIN, "select admin_posts_action($1::uuid[], 'trash', ' ')", [[POST]])).rejects.toThrow(/note_required/);
    await expect(as(ADMIN, "select admin_posts_action('{}'::uuid[], 'trash', '정리')")).rejects.toThrow(/targets_invalid/);
  });
});

describe("대시보드 · 감사 로그", () => {
  it("운영자만 숫자를 본다", async () => {
    await expect(as(MEMBER, "select admin_dashboard()")).rejects.toThrow(/admin_only/);
    const r = await as(ADMIN, "select admin_dashboard() as d");
    const d = (r.rows[0] as { d: Record<string, unknown> }).d;
    expect(d).toMatchObject({ members: 3, published: 1, trash: 0, photo_bytes: 2000, tomorrow_pick_empty: true });
  });

  it("감사 로그는 검색되고 고칠 수 없다", async () => {
    await act([POST], "trash");
    const r = await as(ADMIN, "select action, actor_handle from admin_audit_log('post_trash')");
    expect(r.rows).toEqual([{ action: "post_trash", actor_handle: "wolf1" }]);
    const byHandle = await as(ADMIN, "select count(*)::int as n from admin_audit_log('@wolf1')");
    expect((byHandle.rows[0] as { n: number }).n).toBeGreaterThan(0);
    await expect(as(MEMBER, "select * from admin_audit_log()")).rejects.toThrow(/admin_only/);
    await expect(db.exec("update private.audit_log set detail = '{}'")).rejects.toThrow(/audit_log_immutable/);
    await expect(db.exec("delete from private.audit_log")).rejects.toThrow(/audit_log_immutable/);
    await db.exec("alter table private.audit_log disable trigger audit_log_immutable; update private.audit_log set created_at = now() - interval '4 years'; alter table private.audit_log enable trigger audit_log_immutable;");
    await db.exec("delete from private.audit_log");
  });
});

describe("경고 · 개인정보", () => {
  it("경고는 사유와 함께 본인에게 남고 알림이 간다", async () => {
    await expect(as(ADMIN, "select sanction_member($1, 'warn', '메모', null, null)", [MEMBER])).rejects.toThrow(/reason_required/);
    await as(ADMIN, "select sanction_member($1, 'warn', '메모', null, '동의 없는 인물 사진')", [MEMBER]);
    const mine = await asUser(db, MEMBER, (tx) => tx.query("select reason from public.member_warnings"));
    expect(mine.rows).toEqual([{ reason: "동의 없는 인물 사진" }]);
    const others = await asUser(db, OTHER, (tx) => tx.query("select reason from public.member_warnings"));
    expect(others.rows).toHaveLength(0);
    const n = await db.query(`select kind from public.notifications where recipient_id = '${MEMBER}'`);
    expect(n.rows).toEqual([{ kind: "member_warned" }]);
  });

  it("이메일은 가려서 보이고 원문은 사유와 함께 기록된다", async () => {
    const r = await as(ADMIN, "select * from admin_member_account($1)", [MEMBER]);
    expect(r.rows[0]).toMatchObject({ masked_email: "m********@g****.com", provider: "kakao" });
    expect((await as(ADMIN, "select masked_email from admin_member_account($1)", [OTHER])).rows[0]).toEqual({ masked_email: "o**@x**.kr" });
    await expect(as(ADMIN, "select admin_reveal_email($1, '')", [MEMBER])).rejects.toThrow(/reason_required/);
    await expect(as(MEMBER, "select * from admin_member_account($1)", [MEMBER])).rejects.toThrow(/admin_only/);
    const full = await as(ADMIN, "select admin_reveal_email($1, '권리 침해 연락') as e", [MEMBER]);
    expect(full.rows[0]).toEqual({ e: "moonlight@gmail.com" });
    const log = await db.query("select detail from private.audit_log where action = 'pii_view'");
    expect(log.rows).toEqual([{ detail: { field: "email", reason: "권리 침해 연락" } }]);
  });
});
