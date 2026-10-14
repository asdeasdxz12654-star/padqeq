import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000001501";
const MEMBER = "00000000-0000-4000-8000-000000001502";
const OTHER = "00000000-0000-4000-8000-000000001503";
const NEWBIE = "00000000-0000-4000-8000-000000001504";
const POST = "f4000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MEMBER}'), ('${OTHER}'), ('${NEWBIE}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true), ('${MEMBER}', 'member1', '회원', 'member', true),
      ('${OTHER}', 'other1', '남', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${MEMBER}', '글', 'landscape', 2026, false);
  `);
});

/** 되돌리지 않고 실행 */
async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const ask = (user: string, body = "업로드가 안 돼요") =>
  as(user, "insert into inquiries (author_id, category, body) values (auth.uid(), 'upload', $1) returning id", [body]);

const setSwitches = (user: string, s: { readOnly?: boolean; signup?: boolean; uploads?: boolean }) =>
  as(user, "select set_site_switches($1, $2, $3, '점검 중이에요', '장애 대응')", [
    s.readOnly ?? false,
    s.signup ?? false,
    s.uploads ?? false,
  ]);

describe("공지", () => {
  it("운영자만 쓰고 누구나 본다", async () => {
    await as(ADMIN, "insert into notices (category, title, body, created_by) values ('news', '오픈', '반가워요', auth.uid())");
    await expect(
      asUser(db, MEMBER, (tx) => tx.query("insert into notices (category, title, body, created_by) values ('news', 'x', 'y', auth.uid())")),
    ).rejects.toThrow(/row-level security/);
    expect((await asUser(db, null, (tx) => tx.query("select title from notices"))).rows).toEqual([{ title: "오픈" }]);
  });

  it("점검 공지는 점검 시각이 있어야 한다", async () => {
    await expect(
      as(ADMIN, "insert into notices (category, title, body, created_by) values ('maintenance', '점검', '새벽 점검', auth.uid())"),
    ).rejects.toThrow(/maintenance_time/);
  });
});

describe("1:1 문의", () => {
  it("본인과 운영자만 보고, 답하면 알림이 간다", async () => {
    const { id } = (await ask(MEMBER)).rows[0] as { id: string };
    const seen = async (user: string) => (await asUser(db, user, (tx) => tx.query("select id from inquiries"))).rows.length;
    expect([await seen(MEMBER), await seen(ADMIN), await seen(OTHER)]).toEqual([1, 1, 0]);

    await expect(asUser(db, MEMBER, (tx) => tx.query("select answer_inquiry($1, '셀프 답변')", [id]))).rejects.toThrow(/admin_only/);
    await as(ADMIN, "select answer_inquiry($1, ' 확인했어요 ')", [id]);
    const row = (await db.query<{ status: string; answer: string }>("select status, answer from inquiries")).rows[0]!;
    expect(row).toEqual({ status: "answered", answer: "확인했어요" });
    expect((await db.query("select 1 from notifications where recipient_id = $1 and kind = 'inquiry_answered'", [MEMBER])).rows).toHaveLength(1);
  });

  it("답변 칸은 직접 넣거나 고칠 수 없다", async () => {
    await expect(
      asUser(db, MEMBER, (tx) => tx.query("insert into inquiries (author_id, category, body, status) values (auth.uid(), 'other', '안녕하세요', 'answered')")),
    ).rejects.toThrow(/permission denied/);
    const { id } = (await ask(MEMBER)).rows[0] as { id: string };
    await expect(asUser(db, MEMBER, (tx) => tx.query("update inquiries set answer = 'x' where id = $1", [id]))).rejects.toThrow(/permission denied/);
  });

  it("열린 문의는 5건까지", async () => {
    for (let i = 0; i < 5; i++) await ask(MEMBER, `문의 ${i} 입니다`);
    await expect(ask(MEMBER)).rejects.toThrow(/inquiry_open_limit/);
  });

  it("정지 중에도 문의할 수 있다", async () => {
    await as(ADMIN, "select sanction_member($1, 'suspend', '메모', 7, '사유')", [MEMBER]);
    await ask(MEMBER);
  });
});

describe("긴급 스위치", () => {
  it("운영자만 바꾸고 기록이 남는다", async () => {
    await expect(setSwitches(MEMBER, { readOnly: true })).rejects.toThrow(/admin_only/);
    await setSwitches(ADMIN, { readOnly: true });
    expect((await db.query<{ read_only: boolean; message: string }>("select read_only, message from site_switches")).rows[0]).toEqual({
      read_only: true,
      message: "점검 중이에요",
    });
    expect((await db.query("select 1 from private.audit_log where action = 'site_switches'")).rows).toHaveLength(1);
  });

  it("읽기 전용이면 회원은 쓰지 못하고 운영자는 된다", async () => {
    await setSwitches(ADMIN, { readOnly: true });
    await expect(asUser(db, MEMBER, (tx) => tx.query("update posts set title = '고침' where id = $1", [POST]))).rejects.toThrow(/site_read_only/);
    await expect(
      asUser(db, OTHER, (tx) => tx.query("insert into collections (owner_id, title) values (auth.uid(), '모음')")),
    ).rejects.toThrow(/site_read_only/);
    await asUser(db, ADMIN, (tx) => tx.query("update posts set title = '운영자 수정' where id = $1", [POST]));
    // 장애 신고 통로는 열어 둔다
    await ask(MEMBER);
  });

  it("업로드 중단이면 새 글을 못 만들고 업로드 권한도 꺼진 것으로 본다", async () => {
    await setSwitches(ADMIN, { uploads: true });
    const insert = "insert into posts (author_id, title, category, shot_year, has_people) values (auth.uid(), '새 글', 'landscape', 2026, false)";
    await expect(asUser(db, MEMBER, (tx) => tx.query(insert))).rejects.toThrow(/uploads_closed/);
    expect((await asUser(db, MEMBER, (tx) => tx.query<{ ok: boolean }>("select private.can_upload() as ok"))).rows[0]!.ok).toBe(false);
    await asUser(db, ADMIN, (tx) => tx.query(insert));
    // 이미 있는 글 고치기는 된다
    await asUser(db, MEMBER, (tx) => tx.query("update posts set title = '고침' where id = $1", [POST]));
  });

  it("가입 중단이면 새 프로필을 만들 수 없다", async () => {
    await setSwitches(ADMIN, { signup: true });
    await expect(
      asUser(db, NEWBIE, (tx) => tx.query("select create_my_profile('newbie1', '새 회원', date '2000-01-01', 'v')")),
    ).rejects.toThrow(/signup_closed/);
    await setSwitches(ADMIN, {});
    await asUser(db, NEWBIE, (tx) => tx.query("select create_my_profile('newbie1', '새 회원', date '2000-01-01', 'v')"));
  });

  it("누구나 스위치 상태를 보지만 직접 바꿀 수 없다", async () => {
    expect((await asUser(db, null, (tx) => tx.query("select read_only from site_switches"))).rows).toHaveLength(1);
    await expect(asUser(db, ADMIN, (tx) => tx.query("update site_switches set read_only = true"))).rejects.toThrow(/permission denied/);
  });
});
