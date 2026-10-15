import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002701";
const MOD = "00000000-0000-4000-8000-000000002702";
const AUTHOR = "00000000-0000-4000-8000-000000002703";
const FAN = "00000000-0000-4000-8000-000000002704";
const POST = "fd000000-0000-4000-8000-000000000001";
const HELD = "fd000000-0000-4000-8000-000000000002";
const TRASHED = "fd000000-0000-4000-8000-000000000003";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MOD}'), ('${AUTHOR}'), ('${FAN}');
    insert into public.profiles (id, handle, display_name, role) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin'), ('${MOD}', 'helper1', '도우미', 'member'),
      ('${AUTHOR}', 'author1', '작가', 'member'), ('${FAN}', 'fan1', '팬', 'member');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false),
      ('${HELD}', '${AUTHOR}', '숨김', 'landscape', 2026, false),
      ('${TRASHED}', '${AUTHOR}', '휴지통', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published';
    update public.posts set held_at = now(), held_reason = 'admin' where id = '${HELD}';
    alter table public.posts disable trigger user;
    update public.posts set trashed_at = now() where id = '${TRASHED}';
    alter table public.posts enable trigger user;
    insert into public.reports (post_id, reporter_id, reason) values ('${POST}', '${FAN}', 'spam');
  `);
});

async function as(user: string, sql: string, params: unknown[] = [], aal = "aal2") {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ aal })]);
    const result = await db.query(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const promote = () => as(ADMIN, "select set_member_role($1, 'moderator', '신고 처리 담당')", [MOD]);
const seenPosts = (user: string) =>
  asUser(db, user, (tx) => tx.query<{ id: string }>("select id from posts order by title")).then((r) => r.rows.map((x) => x.id).sort());

describe("역할 지정", () => {
  it("최고 관리자만, 사유와 함께, 감사 로그에 남는다", async () => {
    await expect(as(FAN, "select set_member_role($1, 'moderator', 'x')", [MOD])).rejects.toThrow(/admin_only/);
    await expect(as(ADMIN, "select set_member_role($1, 'moderator', ' ')", [MOD])).rejects.toThrow(/note_required/);
    await promote();
    expect((await db.query<{ role: string }>("select role from profiles where id = $1", [MOD])).rows[0]!.role).toBe("moderator");
    const log = await db.query<{ detail: { before: string; after: string } }>("select detail from private.audit_log where action = 'member_role'");
    expect(log.rows[0]!.detail).toMatchObject({ before: "member", after: "moderator" });
  });

  it("최고 관리자 · 나 자신은 바꿀 수 없고, 관리자로 올릴 수 없다", async () => {
    await expect(as(ADMIN, "select set_member_role($1, 'member', '내림')", [ADMIN])).rejects.toThrow(/cannot_change_self/);
    await expect(as(ADMIN, "select set_member_role($1, 'admin', '올림')", [MOD])).rejects.toThrow(/role_invalid/);
    await promote();
    await expect(as(MOD, "select set_member_role($1, 'moderator', '올림')", [FAN])).rejects.toThrow(/admin_only/);
  });
});

describe("운영 도우미", () => {
  it("가려진 글은 보지만 휴지통 글은 못 본다", async () => {
    expect(await seenPosts(MOD)).toEqual([POST]);
    await promote();
    expect(await seenPosts(MOD)).toEqual([HELD, POST].sort());
    expect(await seenPosts(ADMIN)).toEqual([HELD, POST, TRASHED].sort());
    expect((await asUser(db, MOD, (tx) => tx.query("select 1 from reports"))).rows).toHaveLength(1);
  });

  it("2단계 인증 세션이 아니면 권한이 없다", async () => {
    await promote();
    await expect(as(MOD, "select moderate_post($1, 'hide', '스팸')", [POST], "aal1")).rejects.toThrow(/admin_only/);
  });

  it("신고 처리 · 격리는 하지만 되살리기 · 휴지통은 최고 관리자만", async () => {
    await promote();
    await as(MOD, "select moderate_post($1, 'hide', '스팸')", [POST]);
    expect((await db.query<{ status: string }>("select status from posts where id = $1", [POST])).rows[0]!.status).toBe("hidden");
    await expect(as(MOD, "select moderate_post($1, 'restore', '오판')", [POST])).rejects.toThrow(/admin_only/);
    await expect(as(MOD, "select moderate_post($1, 'release', '해제')", [TRASHED])).rejects.toThrow(/admin_only/);
    await expect(as(MOD, "select admin_posts_action($1, 'trash', '정리')", [[HELD]])).rejects.toThrow(/admin_only/);
    expect(await as(MOD, "select admin_posts_action($1, 'quarantine', '불법 촬영물') as n", [[HELD]])).toEqual([{ n: 1 }]);
    await expect(as(MOD, "select admin_posts_action($1, 'unquarantine', '오판')", [[HELD]])).rejects.toThrow(/admin_only/);
    await as(ADMIN, "select moderate_post($1, 'restore', '오판')", [POST]);
  });

  it("일반 회원에게 경고만 할 수 있다", async () => {
    await promote();
    await as(MOD, "select sanction_member($1, 'warn', '메모', null, '도배')", [FAN]);
    await expect(as(MOD, "select sanction_member($1, 'suspend', '메모', 7, '도배')", [FAN])).rejects.toThrow(/admin_only/);
    await expect(as(MOD, "select sanction_member($1, 'warn', '메모', null, '사유')", [ADMIN])).rejects.toThrow(/admin_only/);
    expect(await as(MOD, "select count(*)::int as n from member_sanction_history($1)", [FAN])).toEqual([{ n: 1 }]);
  });

  it("최고 관리자 전용 기능은 막힌다", async () => {
    await promote();
    await expect(as(MOD, "select admin_member_account($1)", [FAN])).rejects.toThrow(/admin_only/);
    await expect(as(MOD, "select admin_dashboard()")).rejects.toThrow(/admin_only/);
    await expect(as(MOD, "select set_site_limit('report_daily', 30, '조정')")).rejects.toThrow(/admin_only/);
  });

  it("정지되면 권한을 잃는다", async () => {
    await promote();
    await as(ADMIN, "select sanction_member($1, 'suspend', '메모', 3, '사유')", [MOD]);
    await expect(as(MOD, "select moderate_post($1, 'hide', '스팸')", [POST])).rejects.toThrow(/admin_only|member_suspended/);
  });
});
