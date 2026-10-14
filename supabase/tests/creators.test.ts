import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const A = "00000000-0000-4000-8000-000000002001";
const B = "00000000-0000-4000-8000-000000002002";
const C = "00000000-0000-4000-8000-000000002003";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}');
    insert into public.profiles (id, handle, display_name, can_upload) values
      ('${A}', 'photo_a', '사진가', true), ('${B}', 'cos_b', '코스어', true), ('${C}', 'hidden_c', '숨김', false);
    insert into private.adult_confirmations (user_id) values ('${A}');
  `);
});

const setProfile = (user: string, values: string) =>
  asUser(db, user, (tx) => tx.query(`insert into creator_profiles (user_id, roles, region, casting_open, listed) values (auth.uid(), ${values})`));

async function commitAs(user: string, sql: string) {
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
  await db.query(sql);
  await db.exec("commit");
}

const directory = (args = "") =>
  asUser(db, null, (tx) => tx.query<{ handle: string }>(`select handle from creator_directory(${args})`)).then((r) => r.rows.map((x) => x.handle));

describe("크리에이터 디렉토리", () => {
  it("직접 켠 회원만, 최근 활동순으로 보인다", async () => {
    await commitAs(A, "insert into creator_profiles (user_id, roles, region, casting_open) values (auth.uid(), '{photographer}', '서울', true)");
    await commitAs(B, "insert into creator_profiles (user_id, roles, region) values (auth.uid(), '{cosplayer,model}', '부산')");
    await commitAs(C, "insert into creator_profiles (user_id, roles, listed) values (auth.uid(), '{model}', false)");
    // B가 최근에 글을 올렸다
    await db.exec(`
      insert into posts (id, author_id, title, category, shot_year, has_people)
        values ('f6000000-0000-4000-8000-000000000001', '${B}', '글', 'cosplay', 2026, false);
      insert into photos (post_id, position, width, height, bytes) values ('f6000000-0000-4000-8000-000000000001', 0, 100, 100, 1000);
      update posts set status = 'published', published_at = now() + interval '1 minute';
    `);
    expect(await directory()).toEqual(["cos_b", "photo_a"]);
    expect(await directory("role_filter => 'photographer'")).toEqual(["photo_a"]);
    expect(await directory("region_filter => '부산'")).toEqual(["cos_b"]);
    expect(await directory("casting_only => true")).toEqual(["photo_a"]);
  });

  it("섭외 가능은 만 19세 이상 확인을 한 회원만 켠다", async () => {
    await expect(setProfile(B, "'{model}', '서울', true, true")).rejects.toThrow(/adult_required/);
    await setProfile(A, "'{photographer}', '서울', true, true");
  });

  it("역할은 정해진 것만 · 남의 정보는 고칠 수 없다", async () => {
    await expect(setProfile(B, "'{other}', '서울', false, true")).rejects.toThrow(/creator_profiles_roles_check/);
    await commitAs(B, "insert into creator_profiles (user_id, roles) values (auth.uid(), '{cosplayer}')");
    const updated = await asUser(db, A, (tx) => tx.query("update creator_profiles set works = 'x' returning user_id"));
    expect(updated.rows).toHaveLength(0);
  });
});
