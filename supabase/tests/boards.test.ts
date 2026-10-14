import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000001801";
const ADULT = "00000000-0000-4000-8000-000000001802";
const TEEN = "00000000-0000-4000-8000-000000001803";
const NEWBIE = "00000000-0000-4000-8000-000000001804";
const R2 = "00000000-0000-4000-8000-000000001805";
const R3 = "00000000-0000-4000-8000-000000001806";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${ADULT}'), ('${TEEN}'), ('${NEWBIE}'), ('${R2}'), ('${R3}');
    insert into public.profiles (id, handle, display_name, role, created_at) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', now() - interval '30 days'),
      ('${ADULT}', 'adult1', '어른', 'member', now() - interval '30 days'),
      ('${TEEN}', 'teen1', '청소년', 'member', now() - interval '30 days'),
      ('${NEWBIE}', 'newbie1', '새내기', 'member', now()),
      ('${R2}', 'r2user', '둘', 'member', now() - interval '30 days'),
      ('${R3}', 'r3user', '셋', 'member', now() - interval '30 days');
  `);
});

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

const confirm = (user: string, birth: string) =>
  as<{ ok: boolean }>(user, "select confirm_adult($1::date) as ok", [birth]).then((r) => r.rows[0]!.ok);

const castingPost = (user: string) =>
  as<{ id: string }>(
    user,
    `insert into board_posts (board, author_id, title, body, region, casting_kind, casting_terms)
     values ('casting', auth.uid(), '벚꽃 콘셉트 모델 구해요', '공원 야외 촬영', '서울', 'model_wanted', 'tfp') returning id`,
  ).then((r) => r.rows[0]!.id);

const freePost = (user: string, board = "free") =>
  as<{ id: string }>(user, "insert into board_posts (board, author_id, title, body) values ($1, auth.uid(), ' 안녕하세요 ', '첫 글') returning id", [board]).then(
    (r) => r.rows[0]!.id,
  );

describe("성인 확인", () => {
  it("만 19세 이상만 기록하고 생년월일은 남기지 않는다", async () => {
    expect(await confirm(ADULT, "1990-01-01")).toBe(true);
    expect(await confirm(TEEN, "2010-01-01")).toBe(false);
    expect((await asUser(db, ADULT, (tx) => tx.query<{ ok: boolean }>("select am_i_adult() as ok"))).rows[0]!.ok).toBe(true);
    expect((await asUser(db, TEEN, (tx) => tx.query<{ ok: boolean }>("select am_i_adult() as ok"))).rows[0]!.ok).toBe(false);
    const columns = (await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'private' and table_name = 'adult_confirmations'")).rows.map((r) => r.column_name);
    expect(columns.sort()).toEqual(["confirmed_at", "user_id"]);
  });
});

describe("섭외 게시판", () => {
  it("성인 확인 · 가입 7일이 지나야 쓸 수 있다", async () => {
    await expect(castingPost(TEEN)).rejects.toThrow(/adult_required/);
    await confirm(NEWBIE, "1990-01-01");
    await expect(castingPost(NEWBIE)).rejects.toThrow(/account_too_new/);
    await confirm(ADULT, "1990-01-01");
    await castingPost(ADULT);
  });

  it("분류 · 조건 · 지역이 있어야 하고, 공개 답글은 달 수 없다", async () => {
    await confirm(ADULT, "1990-01-01");
    await expect(
      as(ADULT, "insert into board_posts (board, author_id, title, body) values ('casting', auth.uid(), '제목', '내용')"),
    ).rejects.toThrow(/casting_fields/);
    const id = await castingPost(ADULT);
    await expect(as(R2, "insert into board_replies (board_post_id, author_id, body) values ($1, auth.uid(), '지원해요')", [id])).rejects.toThrow(
      /row-level security/,
    );
  });

  it("마감하면 표시가 남는다", async () => {
    await confirm(ADULT, "1990-01-01");
    const id = await castingPost(ADULT);
    await as(ADULT, "update board_posts set closed_at = now() where id = $1", [id]);
    expect((await db.query<{ closed: boolean }>("select closed_at is not null as closed from board_posts")).rows[0]!.closed).toBe(true);
  });
});

describe("장소 · 자유 · Q&A", () => {
  it("누구나 쓰고 답글을 달며, 글쓴이에게 알린다", async () => {
    const id = await freePost(TEEN, "qna");
    expect((await db.query<{ title: string }>("select title from board_posts")).rows[0]!.title).toBe("안녕하세요");
    await as(R2, "insert into board_replies (board_post_id, author_id, body) values ($1, auth.uid(), '답이에요')", [id]);
    const n = await db.query<{ kind: string; board_post_id: string }>("select kind, board_post_id from notifications where recipient_id = $1", [TEEN]);
    expect(n.rows).toEqual([{ kind: "board_replied", board_post_id: id }]);
  });

  it("장소 글은 지역이 있어야 한다", async () => {
    await expect(freePost(TEEN, "places")).rejects.toThrow(/places_region/);
  });

  it("글쓴이는 내 글의 답글을 지울 수 있고, 남의 글은 고칠 수 없다", async () => {
    const id = await freePost(TEEN);
    const { id: reply } = (await as<{ id: string }>(R2, "insert into board_replies (board_post_id, author_id, body) values ($1, auth.uid(), '답') returning id", [id])).rows[0]!;
    expect((await asUser(db, R3, (tx) => tx.query("update board_posts set title = 'x' where id = $1 returning id", [id]))).rows).toHaveLength(0);
    await as(TEEN, "delete from board_replies where id = $1", [reply]);
    expect((await db.query("select 1 from board_replies")).rows).toHaveLength(0);
  });
});

describe("게시판 신고", () => {
  const report = (user: string, post: string, reply: string | null = null, reason = "spam") =>
    as(user, "insert into board_reports (reporter_id, board_post_id, reply_id, reason) values (auth.uid(), $1, $2, $3)", [post, reply, reason]);
  const visible = async (user: string | null, sql: string, id: string) =>
    (await asUser(db, user, (tx) => tx.query(sql, [id]))).rows.length === 1;

  it("서로 다른 3명이 신고하면 가려지고, 운영자가 되돌리거나 가린다", async () => {
    const id = await freePost(TEEN);
    await report(ADULT, id);
    await report(R2, id);
    await report(R3, id);
    const sql = "select 1 from board_posts where id = $1";
    expect([await visible(null, sql, id), await visible(TEEN, sql, id)]).toEqual([false, true]);
    await as(ADMIN, "select moderate_board($1, null, 'dismiss', '문제 없음')", [id]);
    expect(await visible(null, sql, id)).toBe(true);
  });

  it("답글 신고는 답글만 가린다 · 내 글은 신고할 수 없다", async () => {
    const id = await freePost(TEEN);
    const { id: reply } = (await as<{ id: string }>(R2, "insert into board_replies (board_post_id, author_id, body) values ($1, auth.uid(), '나쁜 답') returning id", [id])).rows[0]!;
    await expect(report(TEEN, id)).rejects.toThrow(/row-level security/);
    await report(TEEN, id, reply, "minor_safety");
    expect(await visible(null, "select 1 from board_replies where id = $1", reply)).toBe(false);
    expect(await visible(null, "select 1 from board_posts where id = $1", id)).toBe(true);
    await as(ADMIN, "select moderate_board($1, $2, 'hide', '괴롭힘')", [id, reply]);
    expect((await db.query("select 1 from notifications where recipient_id = $1 and kind = 'board_hidden'", [R2])).rows).toHaveLength(1);
  });

  it("정지 중이면 글을 쓸 수 없다", async () => {
    await as(ADMIN, "select sanction_member($1, 'suspend', '메모', 1, '사유')", [TEEN]);
    await expect(freePost(TEEN)).rejects.toThrow(/member_suspended/);
  });
});
