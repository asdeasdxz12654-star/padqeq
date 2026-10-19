import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000004401";
const MEMBER = "00000000-0000-4000-8000-000000004402";
let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MEMBER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'admin44', '운영자', 'admin', true), ('${MEMBER}', 'member44', '회원', 'member', true);
  `);
});

/** 되돌리지 않고 실행 (user가 null이면 비로그인) */
async function report(user: string | null, digest: string, path: string) {
  await db.exec("begin");
  try {
    await db.exec(user ? "set local role authenticated" : "set local role anon");
    if (user) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await db.query("select public.report_client_error($1, $2)", [digest, path]);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const all = () => db.query<{ digest: string; path: string; hits: number }>("select digest, path, hits from private.client_errors order by id").then((r) => r.rows);

describe("오류 기록", () => {
  it("비로그인도 남기고, 같은 번호 · 화면은 횟수만 늘린다", async () => {
    await report(null, "1234567890", "/explore");
    await report(MEMBER, "1234567890", "/explore");
    await report(MEMBER, "999", "/me");
    expect(await all()).toEqual([
      { digest: "1234567890", path: "/explore", hits: 2 },
      { digest: "999", path: "/me", hits: 1 },
    ]);
  });

  it("형식이 이상하면 버린다 (주소 뒤 조건 · 공백 · 긴 값)", async () => {
    await report(null, "abc<script>", "/x");
    await report(null, "1", "/explore?q=secret");
    await report(null, "1", "explore");
    expect(await all()).toEqual([]);
  });

  it("관리자만 본다", async () => {
    await report(null, "42", "/");
    const seen = await asUser(db, ADMIN, (tx) => tx.query<{ digest: string }>("select digest from public.admin_recent_errors()"));
    expect(seen.rows).toEqual([{ digest: "42" }]);
    await expect(asUser(db, MEMBER, (tx) => tx.query("select * from public.admin_recent_errors()"))).rejects.toThrow(/admin_only/);
    await expect(asUser(db, MEMBER, (tx) => tx.query("select * from private.client_errors"))).rejects.toThrow();
  });

  it("30일 지난 기록은 정리한다", async () => {
    await report(null, "7", "/");
    await db.exec("update private.client_errors set last_at = now() - interval '31 days'");
    expect((await db.query<{ n: number }>("select private.purge_old_client_errors() as n")).rows[0]!.n).toBe(1);
  });
});
