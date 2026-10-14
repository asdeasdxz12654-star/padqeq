import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000001901";
const A = "00000000-0000-4000-8000-000000001902";
const B = "00000000-0000-4000-8000-000000001903";
const C = "00000000-0000-4000-8000-000000001904";
const NEWBIE = "00000000-0000-4000-8000-000000001905";
const TEEN = "00000000-0000-4000-8000-000000001906";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${A}'), ('${B}'), ('${C}'), ('${NEWBIE}'), ('${TEEN}');
    insert into public.profiles (id, handle, display_name, role, created_at) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', now() - interval '30 days'),
      ('${A}', 'photo_a', '사진가', 'member', now() - interval '30 days'),
      ('${B}', 'model_b', '모델', 'member', now() - interval '30 days'),
      ('${C}', 'cos_c', '코스어', 'member', now() - interval '30 days'),
      ('${NEWBIE}', 'newbie1', '새내기', 'member', now()),
      ('${TEEN}', 'teen1', '청소년', 'member', now() - interval '30 days');
    insert into private.adult_confirmations (user_id) values ('${A}'), ('${B}');
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

const start = (from: string, to: string, body = "안녕하세요") =>
  as<{ id: string }>(from, "select start_thread($1, $2) as id", [to, body]).then((r) => r.rows[0]!.id);
const send = (from: string, thread: string, body = "답장") => as(from, "select send_message($1, $2)", [thread, body]);
const threads = (user: string) =>
  asUser(db, user, (tx) =>
    tx.query<{ thread_id: string; my_status: string; other_handle: string; other_read_at: string | null; unread: number; closed: boolean }>(
      "select * from my_threads()",
    ),
  ).then((r) => r.rows);
const kinds = async (user: string) =>
  (await db.query<{ kind: string }>("select kind from notifications where recipient_id = $1 order by id", [user])).rows.map((r) => r.kind);

describe("메시지", () => {
  it("팔로우하지 않는 사람의 첫 대화는 요청으로 오고, 답하면 수락된다", async () => {
    const t = await start(A, B);
    expect((await threads(B))[0]).toMatchObject({ my_status: "request", other_handle: "photo_a", unread: 1 });
    expect(await kinds(B)).toEqual(["message_request"]);
    // 수락 전에는 B의 읽음 시각을 A에게 주지 않는다
    await as(B, "select mark_thread_read($1)", [t]);
    expect((await threads(A))[0]!.other_read_at).toBeNull();
    await send(B, t);
    expect((await threads(B))[0]!.my_status).toBe("active");
    expect((await threads(A))[0]!.other_read_at).not.toBeNull();
  });

  it("나를 팔로우하는 사람에게는 바로 대화가 열린다 · 같은 대화로 이어진다", async () => {
    await db.exec(`insert into member_follows (follower_id, followee_id) values ('${B}', '${A}')`);
    const t1 = await start(A, B);
    const t2 = await start(A, B, "또 왔어요");
    expect(t2).toBe(t1);
    expect((await threads(B))[0]!.my_status).toBe("active");
    // 안 읽은 메시지가 이미 있으면 알림을 또 보내지 않는다
    expect(await kinds(B)).toEqual(["message_received"]);
  });

  it("대화 당사자만 메시지를 본다 (운영자도 직접은 못 본다)", async () => {
    await start(A, B, "비밀 이야기");
    const seen = async (user: string) => (await asUser(db, user, (tx) => tx.query("select body from messages"))).rows.length;
    expect([await seen(A), await seen(B), await seen(C), await seen(ADMIN)]).toEqual([1, 1, 0, 0]);
    await expect(asUser(db, A, (tx) => tx.query("insert into messages (thread_id, sender_id, body) select id, auth.uid(), 'x' from message_threads"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("받기 설정 · 차단 · 거절을 따른다", async () => {
    await as(C, "insert into message_settings (user_id, receive) values (auth.uid(), 'none')");
    await expect(start(A, C)).rejects.toThrow(/messages_closed/);
    await as(C, "update message_settings set receive = 'following' where user_id = auth.uid()");
    await expect(start(A, C)).rejects.toThrow(/messages_closed/);
    await db.exec(`insert into member_follows (follower_id, followee_id) values ('${C}', '${A}')`);
    await start(A, C);

    const t = await start(B, A);
    await as(A, "insert into blocks (blocker_id, blocked_id) values (auth.uid(), $1)", [B]);
    await expect(send(B, t)).rejects.toThrow(/thread_closed/);
    await expect(start(B, A)).rejects.toThrow(/blocked/);

    const t3 = await start(C, B);
    await as(B, "select respond_thread($1, false)", [t3]);
    await expect(send(C, t3)).rejects.toThrow(/thread_closed/);
  });

  it("가입 7일이 안 된 계정은 링크를 보낼 수 없다", async () => {
    await expect(start(NEWBIE, A, "여기 보세요 https://example.com")).rejects.toThrow(/links_not_allowed/);
    await expect(start(NEWBIE, A, "insta.com/abc 놀러 와요")).rejects.toThrow(/links_not_allowed/);
    await start(NEWBIE, A, "안녕하세요 반가워요");
    await start(C, A, "포트폴리오 https://example.com");
  });

  it("정지 중이면 보낼 수 없다", async () => {
    await as(ADMIN, "select sanction_member($1, 'suspend', '메모', 1, '사유')", [A]);
    await expect(start(A, B)).rejects.toThrow(/member_suspended/);
  });
});

describe("섭외 문의", () => {
  const castingPost = async () =>
    (
      await as<{ id: string }>(
        B,
        `insert into board_posts (board, author_id, title, body, region, casting_kind, casting_terms)
         values ('casting', auth.uid(), '촬영 구해요', '내용', '서울', 'photographer_wanted', 'tfp') returning id`,
      )
    ).rows[0]!.id;
  const form = { date: "11.21 오후", place: "서울 · 야외", concept: "벚꽃", terms: "TFP", usage: "개인 SNS", credit: "상호 표기" };

  it("문의서와 함께 지원하면 바로 대화가 열리고 문의서가 첫 메시지에 붙는다", async () => {
    const post = await castingPost();
    const { id } = (await as<{ id: string }>(A, "select start_thread($1, '지원합니다', $2, $3) as id", [B, post, form])).rows[0]!;
    expect((await threads(B))[0]!.my_status).toBe("active");
    const first = await db.query<{ form: typeof form }>("select form from messages where thread_id = $1", [id]);
    expect(first.rows[0]!.form).toEqual(form);
  });

  it("만 19세 미만 · 문의서가 없으면 지원할 수 없다", async () => {
    const post = await castingPost();
    await expect(as(TEEN, "select start_thread($1, '지원', $2, $3)", [B, post, form])).rejects.toThrow(/adult_required/);
    await expect(as(A, "select start_thread($1, '지원', $2, $3)", [B, post, { date: "x" }])).rejects.toThrow(/casting_form_invalid/);
    await expect(as(A, "select start_thread($1, '지원', $2, $3)", [B, post, { ...form, extra: "x" }])).rejects.toThrow(/casting_form_invalid/);
  });

  it("마감한 글에는 지원할 수 없다", async () => {
    const post = await castingPost();
    await db.query("update board_posts set closed_at = now() where id = $1", [post]);
    await expect(as(A, "select start_thread($1, '지원', $2, $3)", [B, post, form])).rejects.toThrow(/casting_closed/);
  });
});

describe("메시지 신고", () => {
  it("신고하면서 차단하고, 운영자는 신고된 대화만 기록을 남기며 연다", async () => {
    const t = await start(A, B, "불쾌한 메시지");
    await as(B, "select report_thread($1, 'spam', '계속 보내요', true)", [t]);
    expect((await db.query("select 1 from blocks where blocker_id = $1 and blocked_id = $2", [B, A])).rows).toHaveLength(1);
    const { id } = (await db.query<{ id: string }>("select id from message_reports")).rows[0]!;

    await expect(asUser(db, A, (tx) => tx.query("select * from admin_reported_thread($1)", [id]))).rejects.toThrow(/admin_only/);
    // 열람 기록이 남는지 보려고 되돌리지 않고 실행
    const rows = await as<{ body: string; sender_handle: string }>(ADMIN, "select * from admin_reported_thread($1)", [id]);
    expect(rows.rows).toEqual([expect.objectContaining({ body: "불쾌한 메시지", sender_handle: "photo_a" })]);

    await as(ADMIN, "select resolve_message_report($1, 'actioned', '경고')", [id]);
    expect(await kinds(B)).toContain("report_reviewed");
    expect((await db.query("select 1 from private.audit_log where action = 'reported_thread_viewed'")).rows.length).toBeGreaterThan(0);
  });
});

describe("탈퇴와 대화", () => {
  it("한 사람이 탈퇴하면 남은 사람의 대화는 남고, 모두 탈퇴하면 대화를 지운다", async () => {
    const t = await start(A, B, "안녕");
    await db.exec(`delete from profiles where id = '${A}'`);
    expect((await db.query<{ sender_id: string | null }>("select sender_id from messages where thread_id = $1", [t])).rows).toEqual([{ sender_id: null }]);
    expect((await db.query<{ n: number }>("select private.purge_orphan_threads() as n")).rows[0]!.n).toBe(0);
    await db.exec(`delete from profiles where id = '${B}'`);
    expect((await db.query<{ n: number }>("select private.purge_orphan_threads() as n")).rows[0]!.n).toBe(1);
    expect((await db.query("select 1 from messages")).rows).toHaveLength(0);
  });
});
