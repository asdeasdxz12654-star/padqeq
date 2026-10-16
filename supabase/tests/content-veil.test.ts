import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000003201";
const AUTHOR = "00000000-0000-4000-8000-000000003202";
const FAN = "00000000-0000-4000-8000-000000003203";
const POST = "fe000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${FAN}');
    insert into public.profiles (id, handle, display_name, role) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin'), ('${AUTHOR}', 'author1', '작가', 'member'), ('${FAN}', 'fan1', '팬', 'member');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published';
    update public.profiles set can_upload = true where id = '${AUTHOR}';
  `);
});

// 실제로 반영되게 (asUser는 끝에 되돌린다)
async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const veil = () =>
  db.query<{ veil: string | null; veil_by_staff: boolean }>("select veil, veil_by_staff from posts where id = $1", [POST]).then((r) => r.rows[0]!);
const staffSet = (user: string, reason: string | null, note = "보기 불편한 분장") =>
  as(user, "select staff_set_post_veil($1, $2, $3)", [POST, reason, note]);

describe("가림 표시", () => {
  it("업로더가 붙이고 뗄 수 있고, 남의 글은 못 바꾼다", async () => {
    await as(AUTHOR, "update posts set veil = 'gore' where id = $1", [POST]);
    expect(await veil()).toEqual({ veil: "gore", veil_by_staff: false });
    await as(FAN, "update posts set veil = null where id = $1", [POST]);
    expect((await veil()).veil).toBe("gore");
    await as(AUTHOR, "update posts set veil = null where id = $1", [POST]);
    expect((await veil()).veil).toBeNull();
  });

  it("업로더는 운영자 표시를 직접 켜지 못한다", async () => {
    await expect(as(AUTHOR, "update posts set veil_by_staff = true where id = $1", [POST])).rejects.toThrow(/permission denied/);
    await as(AUTHOR, "insert into posts (author_id, title, category, shot_year, has_people, veil, veil_by_staff) values (auth.uid(), '새 글', 'landscape', 2026, false, 'fear', true)");
    expect((await db.query("select veil, veil_by_staff from posts where title = '새 글'")).rows).toEqual([{ veil: "fear", veil_by_staff: false }]);
  });

  it("운영자가 붙이면 업로더에게 알리고 감사 로그를 남기며, 업로더는 풀 수 없다", async () => {
    await expect(staffSet(FAN, "gore")).rejects.toThrow(/admin_only/);
    await expect(staffSet(ADMIN, "gore", " ")).rejects.toThrow(/note_required/);
    await expect(staffSet(ADMIN, "nsfw")).rejects.toThrow(/reason_invalid/);
    await staffSet(ADMIN, "gore");
    expect(await veil()).toEqual({ veil: "gore", veil_by_staff: true });
    expect((await db.query("select recipient_id, kind from notifications")).rows).toEqual([{ recipient_id: AUTHOR, kind: "post_veiled" }]);
    expect((await db.query("select action, detail->>'to' as to from private.audit_log where action = 'post_veil'")).rows).toEqual([
      { action: "post_veil", to: "gore" },
    ]);
    await expect(as(AUTHOR, "update posts set veil = null where id = $1", [POST])).rejects.toThrow(/veil_locked/);
    await expect(as(AUTHOR, "update posts set veil = 'fear' where id = $1", [POST])).rejects.toThrow(/veil_locked/);
    // 다른 칸 편집은 그대로 된다
    await as(AUTHOR, "update posts set title = '고친 제목' where id = $1", [POST]);

    // 운영자가 풀면 업로더가 다시 정할 수 있다
    await staffSet(ADMIN, null, "검토 결과 해제");
    expect(await veil()).toEqual({ veil: null, veil_by_staff: false });
    await as(AUTHOR, "update posts set veil = 'phobia' where id = $1", [POST]);
    expect((await veil()).veil).toBe("phobia");
  });

  it("1단계 인증 세션의 운영자는 바꾸지 못한다", async () => {
    await db.exec("begin");
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [ADMIN]);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ aal: "aal1" })]);
    await expect(db.query("select staff_set_post_veil($1, 'gore', 'x')", [POST])).rejects.toThrow(/admin_only/);
    await db.exec("rollback");
  });

  it("보기 설정은 본인만 켠다", async () => {
    await as(FAN, "update profiles set show_veiled = true where id = auth.uid()");
    await as(FAN, "update profiles set show_veiled = true where id = $1", [AUTHOR]);
    expect((await db.query("select handle from profiles where show_veiled order by handle")).rows).toEqual([{ handle: "fan1" }]);
  });
});
