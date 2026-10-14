import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002401";
const AUTHOR = "00000000-0000-4000-8000-000000002402";
const FAN = "00000000-0000-4000-8000-000000002403";
const FAN2 = "00000000-0000-4000-8000-000000002404";
const POST = "fa000000-0000-4000-8000-000000000001";
const DRAFT = "fa000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${FAN}'), ('${FAN2}');
    insert into public.profiles (id, handle, display_name, role) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin'), ('${AUTHOR}', 'author1', '작가', 'member'),
      ('${FAN}', 'fan1', '팬', 'member'), ('${FAN2}', 'fan2', '팬2', 'member');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false), ('${DRAFT}', '${AUTHOR}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published' where id = '${POST}';
  `);
});

async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await db.query(sql, params);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const like = (user: string, post = POST) => as(user, "insert into post_likes (post_id, user_id) values ($1, auth.uid())", [post]);
const stats = (user: string | null) =>
  asUser(db, user, (tx) => tx.query<{ likes: number; liked: boolean }>("select likes, liked from post_like_stats($1)", [[POST]])).then((r) => r.rows[0]);

describe("좋아요", () => {
  it("한 사람이 한 번, 수는 누구나 본다", async () => {
    await like(FAN);
    await expect(like(FAN)).rejects.toThrow(/duplicate key/);
    await like(FAN2);
    expect(await stats(null)).toEqual({ likes: 2, liked: false });
    expect(await stats(FAN)).toEqual({ likes: 2, liked: true });
  });

  it("게시된 글에만 누른다", async () => {
    await expect(like(FAN, DRAFT)).rejects.toThrow(/row-level security/);
  });

  it("누가 눌렀는지는 본인 · 글쓴이 · 운영자만 본다", async () => {
    await like(FAN);
    const seen = async (user: string) => (await asUser(db, user, (tx) => tx.query("select 1 from post_likes"))).rows.length;
    expect([await seen(FAN), await seen(AUTHOR), await seen(ADMIN), await seen(FAN2)]).toEqual([1, 1, 1, 0]);
  });

  it("알림은 안 읽은 게 있으면 묶는다", async () => {
    await like(FAN);
    await like(FAN2);
    const count = async () => (await db.query("select 1 from notifications where recipient_id = $1 and kind = 'post_liked'", [AUTHOR])).rows.length;
    expect(await count()).toBe(1);
    await db.exec(`update notifications set read_at = now() where recipient_id = '${AUTHOR}'`);
    await as(FAN, "delete from post_likes where user_id = auth.uid()");
    await like(FAN);
    expect(await count()).toBe(2);
  });

  it("정지 중이면 누를 수 없다", async () => {
    await as(ADMIN, "select sanction_member($1, 'suspend', '메모', 1, '사유')", [FAN]);
    await expect(like(FAN)).rejects.toThrow(/member_suspended/);
  });
});
