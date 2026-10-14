import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000001601";
const AUTHOR = "00000000-0000-4000-8000-000000001602";
const FAN = "00000000-0000-4000-8000-000000001603";
const MODEL = "00000000-0000-4000-8000-000000001604";
const R2 = "00000000-0000-4000-8000-000000001605";
const R3 = "00000000-0000-4000-8000-000000001606";
const POST = "f5000000-0000-4000-8000-000000000001";
const DRAFT = "f5000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${FAN}'), ('${MODEL}'), ('${R2}'), ('${R3}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true), ('${AUTHOR}', 'author1', '작성자', 'member', true),
      ('${FAN}', 'fan1', '팬', 'member', false), ('${MODEL}', 'model_a', '모델', 'member', false),
      ('${R2}', 'r2user', '둘', 'member', false), ('${R3}', 'r3user', '셋', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false), ('${DRAFT}', '${AUTHOR}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published' where id = '${POST}';
  `);
});

/** 되돌리지 않고 실행 */
async function as<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query<T>(sql, params);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const comment = async (user: string, body: string, parent: string | null = null, post = POST) =>
  (await as<{ id: string }>(user, "insert into comments (post_id, author_id, parent_id, body) values ($1, auth.uid(), $2, $3) returning id", [post, parent, body]))
    .rows[0]!.id;

const kinds = async (user: string) =>
  (await db.query<{ kind: string }>("select kind from notifications where recipient_id = $1 order by id", [user])).rows.map((r) => r.kind);

describe("댓글", () => {
  it("게시된 글에만 달고, 앞뒤 공백을 지운다", async () => {
    const id = await comment(FAN, "  멋져요  ");
    expect((await db.query<{ body: string }>("select body from comments where id = $1", [id])).rows[0]!.body).toBe("멋져요");
    await expect(comment(FAN, "초안", null, DRAFT)).rejects.toThrow(/row-level security/);
  });

  it("답글은 1단계까지", async () => {
    const top = await comment(FAN, "원댓글");
    const reply = await comment(AUTHOR, "답글", top);
    await expect(comment(FAN, "답글의 답글", reply)).rejects.toThrow(/parent_invalid/);
  });

  it("글 작성자 · 원댓글 작성자 · 멘션에게 한 번씩 알린다", async () => {
    const top = await comment(FAN, "와 @model_a 님 최고 @MODEL_A @nobody_here");
    expect(await kinds(AUTHOR)).toEqual(["comment_added"]);
    expect(await kinds(MODEL)).toEqual(["comment_mentioned"]);
    // 글 작성자가 답글에서 원댓글 작성자를 멘션해도 한 번만
    await comment(AUTHOR, "@fan1 고마워요", top);
    expect(await kinds(FAN)).toEqual(["comment_replied"]);
    expect(await kinds(AUTHOR)).toEqual(["comment_added"]);
  });

  it("고치면 수정 시각이 남고, 남의 댓글은 고칠 수 없다", async () => {
    const id = await comment(FAN, "처음");
    await as(FAN, "update comments set body = '고침' where id = $1", [id]);
    expect((await db.query<{ edited: boolean }>("select edited_at is not null as edited from comments where id = $1", [id])).rows[0]!.edited).toBe(true);
    const other = await asUser(db, MODEL, (tx) => tx.query("update comments set body = 'x' where id = $1 returning id", [id]));
    expect(other.rows).toHaveLength(0);
    await expect(asUser(db, FAN, (tx) => tx.query("update comments set pinned = true where id = $1", [id]))).rejects.toThrow(/permission denied/);
  });

  it("글 작성자는 내 글의 댓글을 지울 수 있고, 원댓글을 지우면 답글도 지운다", async () => {
    const top = await comment(FAN, "원댓글");
    await comment(MODEL, "답글", top);
    expect((await asUser(db, MODEL, (tx) => tx.query("delete from comments where id = $1 returning id", [top]))).rows).toHaveLength(0);
    await as(AUTHOR, "delete from comments where id = $1", [top]);
    expect((await db.query("select 1 from comments")).rows).toHaveLength(0);
  });

  it("고정은 글 작성자만, 하나만", async () => {
    const a = await comment(FAN, "하나");
    const b = await comment(MODEL, "둘");
    await expect(as(FAN, "select pin_comment($1, true)", [a])).rejects.toThrow(/comment_not_found/);
    await as(AUTHOR, "select pin_comment($1, true)", [a]);
    await as(AUTHOR, "select pin_comment($1, true)", [b]);
    expect((await db.query<{ id: string }>("select id from comments where pinned")).rows).toEqual([{ id: b }]);
  });

  it("글이 안 보이게 되면 댓글도 안 보인다", async () => {
    await comment(FAN, "댓글");
    await db.exec(`update posts set status = 'hidden' where id = '${POST}'`);
    expect((await asUser(db, null, (tx) => tx.query("select 1 from comments"))).rows).toHaveLength(0);
  });

  it("정지 중이면 댓글을 달 수 없다", async () => {
    await as(ADMIN, "select sanction_member($1, 'suspend', '메모', 1, '사유')", [FAN]);
    await expect(comment(FAN, "댓글")).rejects.toThrow(/member_suspended/);
  });
});

describe("댓글 신고", () => {
  const report = (user: string, id: string, reason = "spam") =>
    as(user, "insert into comment_reports (reporter_id, comment_id, reason) values (auth.uid(), $1, $2)", [id, reason]);
  const visible = async (user: string | null, id: string) =>
    (await asUser(db, user, (tx) => tx.query("select 1 from comments where id = $1", [id]))).rows.length === 1;

  it("내 댓글은 신고할 수 없고, 글 작성자는 내 글의 댓글을 신고할 수 있다", async () => {
    const id = await comment(FAN, "스팸");
    await expect(report(FAN, id)).rejects.toThrow(/row-level security/);
    await report(AUTHOR, id);
  });

  it("서로 다른 3명이 신고하면 가려지고, 쓴 사람 · 운영자만 본다", async () => {
    const id = await comment(FAN, "나쁜 댓글");
    await report(AUTHOR, id);
    await report(R2, id);
    expect(await visible(null, id)).toBe(true);
    await report(R3, id);
    expect([await visible(null, id), await visible(FAN, id), await visible(ADMIN, id)]).toEqual([false, true, true]);
  });

  it("운영자가 가리거나 기각하고, 신고자 · 쓴 사람에게 알린다", async () => {
    const id = await comment(FAN, "댓글");
    await report(AUTHOR, id, "minor_safety");
    expect(await visible(null, id)).toBe(false);
    await expect(as(AUTHOR, "select moderate_comment($1, 'dismiss', '문제 없음')", [id])).rejects.toThrow(/admin_only/);
    await as(ADMIN, "select moderate_comment($1, 'dismiss', '문제 없음')", [id]);
    expect(await visible(null, id)).toBe(true);
    expect(await kinds(AUTHOR)).toContain("report_reviewed");

    await report(R2, id);
    await as(ADMIN, "select moderate_comment($1, 'hide', '괴롭힘')", [id]);
    expect(await visible(null, id)).toBe(false);
    expect(await kinds(FAN)).toContain("comment_hidden");
  });

  it("게시물 신고와 합쳐 하루 20건", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push(await comment(FAN, `댓글 ${i}`));
    for (const id of ids.slice(0, 20)) await report(AUTHOR, id);
    const extra = await comment(MODEL, "하나 더");
    await expect(report(AUTHOR, extra)).rejects.toThrow(/report_rate_limited/);
  });
});
