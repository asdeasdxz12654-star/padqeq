import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002301";
const MEMBER = "00000000-0000-4000-8000-000000002302";
const NEWBIE = "00000000-0000-4000-8000-000000002303";
const AUTHOR = "00000000-0000-4000-8000-000000002304";
const POST = "f9000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MEMBER}'), ('${NEWBIE}'), ('${AUTHOR}');
    insert into public.profiles (id, handle, display_name, role, can_upload, created_at) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true, now() - interval '30 days'),
      ('${MEMBER}', 'member1', '회원', 'member', false, now() - interval '30 days'),
      ('${NEWBIE}', 'newbie1', '새내기', 'member', false, now()),
      ('${AUTHOR}', 'author1', '작가', 'member', true, now() - interval '30 days');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes, phash) values ('${POST}', 0, 100, 100, 1000, 1);
    update public.posts set status = 'published';
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

const canUpload = (user: string) =>
  asUser(db, user, (tx) => tx.query<{ ok: boolean }>("select can_i_upload() as ok")).then((r) => r.rows[0]!.ok);
const setStage = (stage: string) => as(ADMIN, "select set_upload_stage($1, '단계 전환')", [stage]);
const newCode = (uses = 2, days = 7) =>
  as<{ code: string }>(ADMIN, "select create_invite_code($1, $2, '1차 초대') as code", [uses, days]).then((r) => r.rows[0]!.code);
const redeem = (user: string, code: string) =>
  as<{ result: string }>(user, "select redeem_invite_code($1) as result", [code]).then((r) => r.rows[0]!.result);

describe("운영 단계 · 초대 코드", () => {
  it("1인 운영 단계에서는 코드를 쓸 수 없다", async () => {
    const code = await newCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await expect(redeem(MEMBER, code)).rejects.toThrow(/invites_closed/);
  });

  it("초대 단계에서 코드를 넣으면 업로드 권한이 생기고, 횟수를 넘으면 쓸 수 없다", async () => {
    await setStage("invite");
    const code = await newCode(1);
    expect(await canUpload(MEMBER)).toBe(false);
    expect(await redeem(MEMBER, code.toLowerCase().slice(0, 4) + "-" + code.slice(4))).toBe("ok");
    expect(await canUpload(MEMBER)).toBe(true);
    expect(await redeem(NEWBIE, code)).toBe("invalid");
  });

  it("틀린 코드는 한 시간에 10번까지만 시도한다", async () => {
    await setStage("invite");
    for (let i = 0; i < 10; i++) expect(await redeem(MEMBER, "WRONGCOD")).toBe("invalid");
    await expect(redeem(MEMBER, "WRONGCOD")).rejects.toThrow(/invite_rate_limited/);
  });

  it("개방 단계에서는 누구나 올리고, 운영자가 회수한 회원은 막힌다", async () => {
    await setStage("open");
    expect(await canUpload(NEWBIE)).toBe(true);
    await as(ADMIN, "select sanction_member($1, 'grant_upload', '초대', null, null)", [MEMBER]);
    await as(ADMIN, "select sanction_member($1, 'revoke_upload', '스팸', null, null)", [MEMBER]);
    expect(await canUpload(MEMBER)).toBe(false);
  });

  it("단계 전환 · 코드 만들기는 운영자만", async () => {
    await expect(as(MEMBER, "select set_upload_stage('open', '몰래')")).rejects.toThrow(/admin_only/);
    await expect(as(MEMBER, "select create_invite_code(1, 1, 'x')")).rejects.toThrow(/admin_only/);
    expect((await asUser(db, MEMBER, (tx) => tx.query("select 1 from invite_codes"))).rows).toHaveLength(0);
  });
});

describe("금칙어 · 신규 계정 링크", () => {
  const comment = (user: string, body: string) =>
    as(user, "insert into comments (post_id, author_id, body) values ($1, auth.uid(), $2)", [POST, body]);

  it("금칙어는 띄어쓰기 · 기호를 넣어도 막는다", async () => {
    await as(ADMIN, "insert into banned_words (word, created_by) values ('도박사이트', auth.uid())");
    await expect(comment(MEMBER, "좋은 도박 - 사이트 소개")).rejects.toThrow(/banned_word/);
    await comment(MEMBER, "멋진 사진이에요");
  });

  it("가입 7일이 안 된 계정은 댓글 · 게시판에 링크를 쓸 수 없다", async () => {
    await expect(comment(NEWBIE, "여기 보세요 example.com/abc")).rejects.toThrow(/links_not_allowed/);
    await expect(
      as(NEWBIE, "insert into board_posts (board, author_id, title, body) values ('free', auth.uid(), '홍보', 'https://spam.example')"),
    ).rejects.toThrow(/links_not_allowed/);
    await comment(MEMBER, "포트폴리오 https://example.com");
  });

  it("금칙어 목록은 운영자만 보고 바꾼다", async () => {
    await expect(as(MEMBER, "insert into banned_words (word, created_by) values ('x', auth.uid())")).rejects.toThrow(/row-level security/);
  });
});

describe("차단하면 서로 안 보인다", () => {
  it("차단한 사람의 게시물 · 댓글이 서로 보이지 않는다", async () => {
    await as(MEMBER, "insert into comments (post_id, author_id, body) values ($1, auth.uid(), '댓글')", [POST]);
    const sees = async (user: string, sql: string) => (await asUser(db, user, (tx) => tx.query(sql))).rows.length;
    expect(await sees(MEMBER, "select 1 from posts")).toBe(1);

    await as(AUTHOR, "insert into blocks (blocker_id, blocked_id) values (auth.uid(), $1)", [MEMBER]);
    expect(await sees(MEMBER, "select 1 from posts")).toBe(0);
    expect(await sees(AUTHOR, "select 1 from comments")).toBe(0);
    // 운영자 · 다른 사람에게는 그대로
    expect(await sees(ADMIN, "select 1 from comments")).toBe(1);
    expect(await sees(NEWBIE, "select 1 from posts")).toBe(1);
    // 볼 수 없는 글에는 댓글도 달 수 없다
    await expect(as(MEMBER, "insert into comments (post_id, author_id, body) values ($1, auth.uid(), '또')", [POST])).rejects.toThrow(/row-level security/);
  });
});
