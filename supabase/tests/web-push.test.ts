import type { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const A = "00000000-0000-4000-8000-000000003101";
const B = "00000000-0000-4000-8000-000000003102";
const TOKEN = "test-dispatch-token-0123456789abcdefghijklmnop";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${A}'), ('${B}');
    insert into public.profiles (id, handle, display_name) values ('${A}', 'aaa1', 'A'), ('${B}', 'bbb1', 'B');
    -- 테스트용 토큰 (운영 토큰과 다름)
    insert into private.push_dispatch_keys (key_hash) values ('${createHash("sha256").update(TOKEN).digest("hex")}');
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
const register = (user: string, endpoint: string) => as(user, "select register_push_subscription($1)", [endpoint]);
// Worker처럼 비로그인(anon) 역할로, 실제로 반영되게 (asUser는 끝에 되돌린다)
async function asAnon<T>(sql: string, params: unknown[] = []) {
  await db.exec("set role anon");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}
const claim = (token = TOKEN) => asAnon<{ endpoint: string }>("select endpoint from claim_push_batch($1)", [token]).then((r) => r.map((x) => x.endpoint).sort());
const notify = (user: string, ago = "0 minutes") =>
  db.query(`insert into public.notifications (recipient_id, kind, created_at) values ($1, 'memory_today', now() - $2::interval)`, [user, ago]);

describe("웹 푸시", () => {
  it("기기는 본인만 등록 · 조회 · 삭제", async () => {
    await register(A, "https://push.example/a1");
    expect(await as(A, "select endpoint from push_subscriptions")).toEqual([{ endpoint: "https://push.example/a1" }]);
    expect(await as(B, "select endpoint from push_subscriptions")).toEqual([]);
    await expect(as(A, "insert into push_subscriptions (user_id, endpoint) values (auth.uid(), 'https://x.example')")).rejects.toThrow(/permission denied/);
    await expect(register(A, "http://insecure.example")).rejects.toThrow(/endpoint_invalid/);
  });

  it("같은 기기를 다른 계정이 쓰면 새 계정으로 옮긴다", async () => {
    await register(A, "https://push.example/shared");
    await register(B, "https://push.example/shared");
    expect((await db.query<{ user_id: string }>("select user_id from push_subscriptions")).rows).toEqual([{ user_id: B }]);
  });

  it("새 알림을 받을 사람의 기기만 한 번씩 내주고, 토큰이 틀리면 거절", async () => {
    await register(A, "https://push.example/a1");
    await register(A, "https://push.example/a2");
    await register(B, "https://push.example/b1");
    await notify(A);
    await notify(A);
    await expect(claim("wrong-token-0123456789abcdefghijklmnopqr")).rejects.toThrow(/not_allowed/);
    expect(await claim()).toEqual(["https://push.example/a1", "https://push.example/a2"]);
    expect(await claim()).toEqual([]);
  });

  it("1시간 넘게 밀린 알림은 보내지 않는다", async () => {
    await register(B, "https://push.example/b1");
    await notify(B, "2 hours");
    expect(await claim()).toEqual([]);
  });

  it("없는 기기는 토큰으로만 지운다", async () => {
    await register(A, "https://push.example/a1");
    const id = (await db.query<{ id: string }>("select id from push_subscriptions")).rows[0]!.id;
    await expect(asUser(db, null, (tx) => tx.query("select drop_push_subscriptions($1, $2)", ["x".repeat(40), [id]]))).rejects.toThrow(/not_allowed/);
    await asAnon("select drop_push_subscriptions($1, $2)", [TOKEN, [id]]);
    expect((await db.query("select 1 from push_subscriptions")).rows).toHaveLength(0);
  });
});
