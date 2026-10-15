import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000002901";
const FAN = "00000000-0000-4000-8000-000000002902";
const STRANGER = "00000000-0000-4000-8000-000000002903";
const DRAFT = "ff000000-0000-4000-8000-000000000001";
const LIVE = "ff000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${FAN}'), ('${STRANGER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${AUTHOR}', 'author1', '작가', 'member', true), ('${FAN}', 'fan1', '팬', 'member', false), ('${STRANGER}', 'other1', '남', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${DRAFT}', '${AUTHOR}', '초안', 'cosplay', 2026, false), ('${LIVE}', '${AUTHOR}', '게시', 'cosplay', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published' where id = '${LIVE}';
    insert into public.member_follows (follower_id, followee_id) values ('${FAN}', '${AUTHOR}'), ('${STRANGER}', '${AUTHOR}');
    update public.profiles set credit_auto_approve = true where id in ('${FAN}');
  `);
});

async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const credit = (post: string, member: string) =>
  as(AUTHOR, "insert into credits (post_id, role, member_id, status) values ($1, 'cosplayer', $2, 'pending')", [post, member]);
const statusOf = async (member: string) =>
  (await db.query<{ status: string }>("select status from credits where member_id = $1", [member])).rows.map((r) => r.status);
const kinds = async (user: string) =>
  (await db.query<{ kind: string }>("select kind::text from notifications where recipient_id = $1 order by id", [user])).rows.map((r) => r.kind);

describe("크레딧 자동 승인", () => {
  it("게시된 글: 켜 두고 팔로우하는 업로더면 바로 승인 · 아니면 요청", async () => {
    await credit(LIVE, FAN);
    await credit(LIVE, STRANGER);
    expect(await statusOf(FAN)).toEqual(["approved"]);
    expect(await kinds(FAN)).toEqual(["credit_auto_approved"]);
    // 설정을 켜지 않은 회원은 팔로우해도 직접 승인
    expect(await statusOf(STRANGER)).toEqual(["pending"]);
    expect(await kinds(STRANGER)).toEqual(["credit_requested"]);
  });

  it("초안은 게시할 때 판단한다", async () => {
    await credit(DRAFT, FAN);
    expect(await statusOf(FAN)).toEqual(["pending"]);
    expect(await kinds(FAN)).toEqual([]);
    await db.query("update posts set status = 'published' where id = $1", [DRAFT]);
    expect(await statusOf(FAN)).toEqual(["approved"]);
    expect(await kinds(FAN)).toEqual(["credit_auto_approved"]);
  });

  it("팔로우를 끊으면 다시 직접 승인", async () => {
    await db.exec(`delete from member_follows where follower_id = '${FAN}'`);
    await credit(LIVE, FAN);
    expect(await statusOf(FAN)).toEqual(["pending"]);
  });

  it("설정은 본인만 바꾼다", async () => {
    await as(STRANGER, "update profiles set credit_auto_approve = true where id = $1", [FAN]);
    expect((await db.query<{ v: boolean }>("select credit_auto_approve as v from profiles where id = $1", [STRANGER])).rows[0]!.v).toBe(false);
    await as(STRANGER, "update profiles set credit_auto_approve = true where id = auth.uid()");
    expect((await db.query<{ v: boolean }>("select credit_auto_approve as v from profiles where id = $1", [STRANGER])).rows[0]!.v).toBe(true);
  });
});

describe("연말 결산 알림", () => {
  const send = (day: string) => db.query<{ n: number }>("select private.send_year_review_alerts($1::date) as n", [day]).then((r) => r.rows[0]!.n);

  it("12월 8일 전에는 보내지 않는다", async () => {
    expect(await send("2026-12-07")).toBe(0);
    expect(await send("2026-11-20")).toBe(0);
  });

  it("올해 사진이 있는 회원 · 크레딧된 회원에게 한 해 한 번", async () => {
    await credit(LIVE, FAN);
    expect(await send("2026-12-08")).toBe(2);
    expect(await send("2026-12-09")).toBe(0);
    expect(await kinds(AUTHOR)).toContain("year_review");
    expect(await kinds(STRANGER)).not.toContain("year_review");
  });

  it("추억 알림을 끈 회원은 빼고, 지난해 사진만 있으면 보내지 않는다", async () => {
    await db.exec(`update profiles set memory_alerts = false where id = '${AUTHOR}'`);
    expect(await send("2026-12-10")).toBe(0);
    await db.exec(`update profiles set memory_alerts = true where id = '${AUTHOR}'; update posts set shot_year = 2025`);
    expect(await send("2026-12-10")).toBe(0);
  });
});
