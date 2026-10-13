import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000000f01";
const CLAIMANT = "00000000-0000-4000-8000-000000000f02";
const OTHER = "00000000-0000-4000-8000-000000000f03";
const POST = "d0000000-0000-4000-8000-000000000001";
const CREDIT = "d1000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${CLAIMANT}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${AUTHOR}', 'author1', '작가', 'member', true),
      ('${CLAIMANT}', 'model1', '모델', 'member', false),
      ('${OTHER}', 'other1', '남', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published';
    insert into public.credits (id, post_id, role, external_label, status) values ('${CREDIT}', '${POST}', 'model', '모델님', 'external');
  `);
});

async function as<T>(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const claim = (user: string) =>
  as<{ id: string }>(user, "insert into credit_claims (credit_id, claimant_id, note) values ($1, $2, '저예요') returning id", [CREDIT, user]).then(
    (r) => r[0]!.id,
  );
const resolve = (user: string, id: string, accept: boolean) => as(user, "select public.resolve_credit_claim($1, $2)", [id, accept]);
const kinds = async (user: string) =>
  (await db.query<{ kind: string }>("select kind::text from notifications where recipient_id = $1 order by id", [user])).rows.map((r) => r.kind);

describe("크레딧 연결 요청", () => {
  it("승인하면 회원 크레딧으로 바뀌고, 다른 요청은 거절된다", async () => {
    const mine = await claim(CLAIMANT);
    const theirs = await claim(OTHER);
    expect(await kinds(AUTHOR)).toEqual(["credit_claimed", "credit_claimed"]);
    await resolve(AUTHOR, mine, true);
    expect((await db.query("select member_id, status::text, external_label from credits where id = $1", [CREDIT])).rows).toEqual([
      { member_id: CLAIMANT, status: "approved", external_label: null },
    ]);
    expect((await db.query<{ status: string }>("select status::text from credit_claims where id = $1", [theirs])).rows[0]!.status).toBe("rejected");
    expect(await kinds(CLAIMANT)).toEqual(["credit_claim_approved"]);
    expect(await kinds(OTHER)).toEqual(["credit_claim_rejected"]);
  });

  it("작성자만 처리할 수 있다", async () => {
    const id = await claim(CLAIMANT);
    await expect(resolve(CLAIMANT, id, true)).rejects.toThrow(/claim_not_found/);
    await expect(resolve(OTHER, id, true)).rejects.toThrow(/claim_not_found/);
  });

  it("회원 크레딧 · 내 글의 크레딧에는 요청할 수 없다", async () => {
    await db.exec(`update credits set status = 'approved', member_id = '${OTHER}', external_label = null where id = '${CREDIT}'`);
    await expect(claim(CLAIMANT)).rejects.toThrow(/row-level security/);
    await db.exec(`update credits set status = 'external', member_id = null, external_label = '모델님' where id = '${CREDIT}'`);
    await expect(claim(AUTHOR)).rejects.toThrow(/row-level security/);
  });

  it("같은 크레딧에 대기 중인 요청은 하나", async () => {
    await claim(CLAIMANT);
    await expect(claim(CLAIMANT)).rejects.toThrow(/duplicate key/);
  });

  it("요청은 본인 · 작성자만 본다", async () => {
    await claim(CLAIMANT);
    const count = async (user: string) => (await asUser(db, user, (tx) => tx.query("select 1 from credit_claims"))).rows.length;
    expect(await count(CLAIMANT)).toBe(1);
    expect(await count(AUTHOR)).toBe(1);
    expect(await count(OTHER)).toBe(0);
  });

  it("이미 같은 역할로 올라 있으면 미가입 표기만 지운다", async () => {
    await db.exec(`insert into credits (post_id, role, member_id, status) values ('${POST}', 'model', '${CLAIMANT}', 'approved')`);
    const id = await claim(CLAIMANT);
    await resolve(AUTHOR, id, true);
    expect((await db.query("select member_id from credits where post_id = $1", [POST])).rows).toEqual([{ member_id: CLAIMANT }]);
  });
});
