import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000001701";
const MEMBER = "00000000-0000-4000-8000-000000001702";
const OTHER = "00000000-0000-4000-8000-000000001703";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MEMBER}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true), ('${MEMBER}', 'member1', '회원', 'member', false),
      ('${OTHER}', 'other1', '남', 'member', false);
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

const KST_TODAY = "(now() at time zone 'Asia/Seoul')::date";

const save = async (target: string | null, name = "서울 코믹월드", offset = 10, slug = "서울-코믹월드-2026-11") =>
  (
    await as<{ id: string }>(
      ADMIN,
      `select save_event($1, $2, ${KST_TODAY} + $3::int, ${KST_TODAY} + $3::int + 1, 'SETEC', '서울', 'https://example.com', '설명', $4) as id`,
      [target, name, offset, slug],
    )
  ).rows[0]!.id;

const propose = (user: string, offset = 10) =>
  as<{ id: string }>(
    user,
    `insert into events (name, starts_on, ends_on, venue, region, proposed_by)
     values (' 부산 코스 행사 ', ${KST_TODAY} + $1::int, ${KST_TODAY} + $1::int, '벡스코', '부산', auth.uid()) returning id`,
    [offset],
  );

const kinds = async (user: string) =>
  (await db.query<{ kind: string; event_id: string | null }>("select kind, event_id from notifications where recipient_id = $1 order by id", [user])).rows;

describe("행사", () => {
  it("운영자가 등록하면 공식 행사 · 행사 태그가 생긴다", async () => {
    const id = await save(null);
    const row = (await db.query<{ status: string; kind: string; slug: string }>(
      "select e.status, t.kind, t.slug from events e join tags t on t.id = e.tag_id where e.id = $1", [id])).rows[0];
    expect(row).toEqual({ status: "official", kind: "event", slug: "서울-코믹월드-2026-11" });
    expect((await asUser(db, null, (tx) => tx.query("select 1 from events"))).rows).toHaveLength(1);
    await expect(as(MEMBER, "select save_event(null, 'x', current_date, current_date, 'v', '서울', null, '', 'x')")).rejects.toThrow(/admin_only/);
  });

  it("회원 제안은 승인 전까지 제안자 · 운영자만 보고, 승인하면 알림이 간다", async () => {
    const { id } = (await propose(MEMBER)).rows[0]!;
    const seen = async (user: string | null) => (await asUser(db, user, (tx) => tx.query("select name from events"))).rows;
    expect(await seen(MEMBER)).toEqual([{ name: "부산 코스 행사" }]);
    expect(await seen(OTHER)).toEqual([]);
    expect(await seen(ADMIN)).toHaveLength(1);

    await save(id, "부산 코스 행사", 10, "부산-코스-행사");
    expect(await seen(OTHER)).toHaveLength(1);
    expect(await kinds(MEMBER)).toEqual([{ kind: "event_approved", event_id: id }]);
  });

  it("제안을 거절하면 알리고, 직접 공식으로 넣을 수는 없다", async () => {
    const { id } = (await propose(MEMBER)).rows[0]!;
    await as(ADMIN, "select reject_event($1, '중복 행사')", [id]);
    expect(await kinds(MEMBER)).toEqual([{ kind: "event_rejected", event_id: id }]);
    await expect(
      asUser(db, MEMBER, (tx) =>
        tx.query("insert into events (name, starts_on, ends_on, venue, region, proposed_by, status) values ('x', current_date, current_date, 'v', '서울', auth.uid(), 'official')"),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("지난 행사 · 이상한 지역은 제안할 수 없다", async () => {
    await expect(propose(MEMBER, -3)).rejects.toThrow(/event_past/);
    await expect(
      asUser(db, MEMBER, (tx) =>
        tx.query(`insert into events (name, starts_on, ends_on, venue, region, proposed_by) values ('x', ${KST_TODAY} + 1, ${KST_TODAY} + 1, 'v', '화성', auth.uid())`),
      ),
    ).rejects.toThrow(/events_region_check/);
  });
});

describe("참가 예정", () => {
  it("비공개 참가는 나만 보고, 수는 모두에게 센다", async () => {
    const id = await save(null);
    await as(MEMBER, "insert into event_attendees (event_id, user_id) values ($1, auth.uid())", [id]);
    await as(OTHER, "insert into event_attendees (event_id, user_id, is_public, cos_note) values ($1, auth.uid(), true, ' 원신 · 라이덴 ')", [id]);
    const seen = async (user: string | null) =>
      (await asUser(db, user, (tx) => tx.query<{ cos_note: string }>("select cos_note from event_attendees order by cos_note"))).rows;
    expect(await seen(null)).toEqual([{ cos_note: "원신 · 라이덴" }]);
    expect(await seen(MEMBER)).toHaveLength(2);
    const counts = await asUser(db, null, (tx) => tx.query<{ attendees: number }>("select attendees from event_attendee_counts($1)", [[id]]));
    expect(counts.rows).toEqual([{ attendees: 2 }]);
  });

  it("끝난 행사 · 제안 중인 행사에는 참가 표시를 할 수 없다", async () => {
    const past = await save(null, "지난 행사", -5, "지난-행사");
    await expect(as(MEMBER, "insert into event_attendees (event_id, user_id) values ($1, auth.uid())", [past])).rejects.toThrow(/row-level security/);
    const { id } = (await propose(OTHER)).rows[0]!;
    await expect(as(MEMBER, "insert into event_attendees (event_id, user_id) values ($1, auth.uid())", [id])).rejects.toThrow(/row-level security/);
  });

  it("행사 전날 한 번만 알림을 보낸다", async () => {
    const tomorrow = await save(null, "내일 행사", 1, "내일-행사");
    const later = await save(null, "다음 주 행사", 7, "다음주-행사");
    await as(MEMBER, "insert into event_attendees (event_id, user_id) values ($1, auth.uid()), ($2, auth.uid())", [tomorrow, later]);
    expect((await db.query<{ n: number }>("select private.send_event_reminders() as n")).rows[0]!.n).toBe(1);
    expect((await db.query<{ n: number }>("select private.send_event_reminders() as n")).rows[0]!.n).toBe(0);
    expect(await kinds(MEMBER)).toEqual([{ kind: "event_reminder", event_id: tomorrow }]);
  });

  it("정지 중이면 참가 표시를 할 수 없다", async () => {
    const id = await save(null);
    await as(ADMIN, "select sanction_member($1, 'suspend', '메모', 1, '사유')", [MEMBER]);
    await expect(as(MEMBER, "insert into event_attendees (event_id, user_id) values ($1, auth.uid())", [id])).rejects.toThrow(/member_suspended/);
  });
});
