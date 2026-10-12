import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const EXISTING = "00000000-0000-4000-8000-0000000000e1";
const NEWBIE = "00000000-0000-4000-8000-0000000000e2";

// 서울 기준 오늘에서 N년 전 (만 나이 경계 검사용)
const yearsAgo = (n: number) => `((now() at time zone 'Asia/Seoul')::date - interval '${n} years')::date`;

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${EXISTING}'), ('${NEWBIE}');
    insert into public.profiles (id, handle, display_name) values ('${EXISTING}', 'moon_cos', '문');
  `);
});

const signup = (
  userId: string | null,
  { handle = "new_member", name = "새 회원", birth = "date '2000-03-01'", version = "2026-10" } = {},
) =>
  asUser(db, userId, async (tx) => {
    await tx.query(`select public.create_my_profile($1, $2, ${birth}, $3)`, [handle, name, version]);
    const profile = await tx.query<{ handle: string; role: string; can_upload: boolean }>(
      "select handle::text, role::text, can_upload from public.profiles where id = (select auth.uid())",
    );
    return profile.rows[0];
  });

describe("가입 함수", () => {
  it("회원 프로필을 만들고 권한은 기본값으로 시작한다", async () => {
    expect(await signup(NEWBIE)).toEqual({ handle: "new_member", role: "member", can_upload: false });
  });

  it("동의 기록이 함께 남는다", async () => {
    // 동의 기록은 API 역할로 읽을 수 없으므로 슈퍼유저 트랜잭션 안에서 만들고 확인한 뒤 되돌린다
    const rows = await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [NEWBIE]);
      await tx.query("select public.create_my_profile('agree_check', '동의', date '1999-01-01', '2026-10')");
      const result = await tx.query<{ policy_version: string }>(
        "select policy_version from private.signup_agreements where user_id = $1",
        [NEWBIE],
      );
      await tx.rollback();
      return result.rows;
    });
    expect(rows).toEqual([{ policy_version: "2026-10" }]);
  });

  it("로그인하지 않으면 함수를 부를 수 없다", async () => {
    await expect(signup(null)).rejects.toThrow(/permission denied/);
  });

  it("이미 프로필이 있으면 다시 만들 수 없다", async () => {
    await expect(signup(EXISTING)).rejects.toThrow(/profile_exists/);
  });

  it("만 14세 미만은 가입할 수 없다", async () => {
    await expect(signup(NEWBIE, { birth: `${yearsAgo(14)} + 1` })).rejects.toThrow(/under_14/);
  });

  it("만 14세가 되는 날부터 가입할 수 있다", async () => {
    expect(await signup(NEWBIE, { birth: yearsAgo(14) })).toMatchObject({ handle: "new_member" });
  });

  it("미래 날짜나 너무 오래된 생년월일은 거부", async () => {
    await expect(signup(NEWBIE, { birth: "date '2999-01-01'" })).rejects.toThrow(/birth_date_invalid/);
    await expect(signup(NEWBIE, { birth: "date '1800-01-01'" })).rejects.toThrow(/birth_date_invalid/);
  });

  it("이미 쓰는 핸들은 대소문자가 달라도 거부", async () => {
    await expect(signup(NEWBIE, { handle: "moon_cos" })).rejects.toThrow(/handle_taken/);
  });

  it("예약어 핸들은 거부", async () => {
    await expect(signup(NEWBIE, { handle: "admin" })).rejects.toThrow(/handle_reserved/);
    await expect(signup(NEWBIE, { handle: "haedam_official" })).rejects.toThrow(/handle_reserved/);
  });

  it("형식이 틀린 핸들은 거부", async () => {
    for (const handle of ["ab", "Upper", "한글핸들", "a".repeat(21), "dot.name"]) {
      await expect(signup(NEWBIE, { handle })).rejects.toThrow(/handle_invalid/);
    }
  });

  it("표시 이름은 공백만이거나 제어 문자를 넣을 수 없다", async () => {
    await expect(signup(NEWBIE, { name: "   " })).rejects.toThrow(/display_name_invalid/);
    await expect(signup(NEWBIE, { name: "a\u0007b" })).rejects.toThrow(/display_name_invalid/);
  });
});

describe("핸들 검사", () => {
  const status = (handle: string) =>
    asUser(db, NEWBIE, async (tx) => {
      const r = await tx.query<{ s: string }>("select public.handle_status($1) as s", [handle]);
      return r.rows[0]?.s;
    });

  it("상태를 구분해 알려 준다", async () => {
    expect(await status("fresh_name")).toBe("ok");
    expect(await status("MOON_COS")).toBe("invalid");
    expect(await status("moon_cos")).toBe("taken");
    expect(await status("support")).toBe("reserved");
  });

  it("비로그인은 쓸 수 없다", async () => {
    await expect(
      asUser(db, null, (tx) => tx.query("select public.handle_status('fresh_name')")),
    ).rejects.toThrow(/permission denied/);
  });

  it("동의 기록 테이블은 API 역할로 접근할 수 없다", async () => {
    await expect(
      asUser(db, NEWBIE, (tx) => tx.query("select * from private.signup_agreements")),
    ).rejects.toThrow(/permission denied/);
  });
});
