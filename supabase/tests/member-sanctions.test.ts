import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000001301";
const MEMBER = "00000000-0000-4000-8000-000000001302";
const OTHER = "00000000-0000-4000-8000-000000001303";
const MINE = "f2000000-0000-4000-8000-000000000001";
const DRAFT = "f2000000-0000-4000-8000-000000000002";
const THEIRS = "f2000000-0000-4000-8000-000000000003";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MEMBER}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true),
      ('${MEMBER}', 'member1', '회원', 'member', true),
      ('${OTHER}', 'other1', '남', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${MINE}', '${MEMBER}', '내 글', 'landscape', 2026, false),
      ('${DRAFT}', '${MEMBER}', '초안', 'landscape', 2026, false),
      ('${THEIRS}', '${OTHER}', '남의 글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published' where id <> '${DRAFT}';
  `);
});

const sanction = (actor: string, target: string, action: string, days: number | null = null, reason: string | null = null) =>
  asUser(db, actor, (tx) =>
    tx.query("select sanction_member($1, $2, '내부 메모', $3, $4)", [target, action, days, reason]),
  );

/** 되돌리지 않고 실행 (부수 효과 확인용) */
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

const suspend = () => as(ADMIN, "select sanction_member($1, 'suspend', '반복 위반', 7, '촬영 동의 없는 사진 게시')", [MEMBER]);

describe("회원 제재", () => {
  it("운영자만 할 수 있다", async () => {
    await expect(sanction(OTHER, MEMBER, "revoke_upload")).rejects.toThrow(/admin_only/);
  });

  it("운영자 계정은 제재할 수 없다", async () => {
    await expect(sanction(ADMIN, ADMIN, "revoke_upload")).rejects.toThrow(/target_admin/);
  });

  it("정지는 기간 · 사유가 필요하다", async () => {
    await expect(sanction(ADMIN, MEMBER, "suspend", null, "사유")).rejects.toThrow(/days_invalid/);
    await expect(sanction(ADMIN, MEMBER, "suspend", 3651, "사유")).rejects.toThrow(/days_invalid/);
    await expect(sanction(ADMIN, MEMBER, "suspend", 7, "  ")).rejects.toThrow(/reason_required/);
  });

  it("업로드 권한을 주고 회수하며, 바뀌는 게 없으면 거부한다", async () => {
    await as(ADMIN, "select sanction_member($1, 'grant_upload', '초대', null, null)", [OTHER]);
    expect((await db.query<{ can_upload: boolean }>("select can_upload from profiles where id = $1", [OTHER])).rows[0]!.can_upload).toBe(true);
    await expect(sanction(ADMIN, OTHER, "grant_upload")).rejects.toThrow(/no_change/);
    await as(ADMIN, "select sanction_member($1, 'revoke_upload', '회수', null, null)", [OTHER]);
    const kinds = await db.query<{ kind: string }>("select kind from notifications where recipient_id = $1 order by id", [OTHER]);
    expect(kinds.rows.map((r) => r.kind)).toEqual(["upload_granted", "upload_revoked"]);
  });

  it("정지 상태는 본인과 운영자만 본다", async () => {
    await suspend();
    const seen = async (user: string) =>
      (await asUser(db, user, (tx) => tx.query<{ reason: string }>("select reason from member_restrictions"))).rows;
    expect(await seen(MEMBER)).toEqual([{ reason: "촬영 동의 없는 사진 게시" }]);
    expect(await seen(ADMIN)).toHaveLength(1);
    expect(await seen(OTHER)).toHaveLength(0);
    await expect(asUser(db, null, (tx) => tx.query("select 1 from member_restrictions"))).rejects.toThrow(/permission denied/);
  });

  it("정지 중에는 게시 · 수정 · 신고 · 컬렉션 · 프로필 수정이 막힌다", async () => {
    await suspend();
    const blocked = [
      "insert into posts (author_id, title, category, shot_year, has_people) values (auth.uid(), '새 글', 'landscape', 2026, false)",
      `update posts set title = '고침' where id = '${MINE}'`,
      `select publish_my_post('${DRAFT}', null, null, null, false, false)`,
      `insert into reports (reporter_id, post_id, reason) values (auth.uid(), '${THEIRS}', 'spam')`,
      "insert into collections (owner_id, title) values (auth.uid(), '모음')",
      "update profiles set bio = '안녕' where id = auth.uid()",
    ];
    for (const sql of blocked) {
      await expect(asUser(db, MEMBER, (tx) => tx.query(sql)), sql).rejects.toThrow(/member_suspended/);
    }
    expect((await asUser(db, MEMBER, (tx) => tx.query<{ ok: boolean }>("select private.can_upload() as ok"))).rows[0]!.ok).toBe(false);
  });

  it("정지 중에도 지우기 · 저장 · 팔로우 · 탈퇴 요청은 된다", async () => {
    await suspend();
    await asUser(db, MEMBER, async (tx) => {
      await tx.query("insert into bookmarks (user_id, post_id) values (auth.uid(), $1)", [THEIRS]);
      await tx.query("insert into member_follows (follower_id, followee_id) values (auth.uid(), $1)", [OTHER]);
      await tx.query("select request_account_deletion()");
      expect((await tx.query("delete from posts where id = $1 returning id", [MINE])).rows).toHaveLength(1);
    });
  });

  it("해제하거나 기간이 지나면 다시 쓸 수 있다", async () => {
    await suspend();
    await as(ADMIN, "select sanction_member($1, 'lift', '소명 인정', null, null)", [MEMBER]);
    await asUser(db, MEMBER, (tx) => tx.query(`update posts set title = '고침' where id = '${MINE}'`));
    await expect(sanction(ADMIN, MEMBER, "lift")).rejects.toThrow(/not_suspended/);

    await suspend();
    await db.exec(`update member_restrictions set suspended_until = now() - interval '1 minute'`);
    await asUser(db, MEMBER, (tx) => tx.query(`update posts set title = '고침' where id = '${MINE}'`));
    expect((await db.query<{ n: number }>("select private.purge_expired_restrictions() as n")).rows[0]!.n).toBe(1);
  });

  it("알림 · 감사 기록을 남기고, 기록은 운영자만 본다", async () => {
    await suspend();
    const kinds = await db.query<{ kind: string; actor_id: string | null }>(
      "select kind, actor_id from notifications where recipient_id = $1", [MEMBER]);
    expect(kinds.rows).toEqual([{ kind: "member_suspended", actor_id: null }]);
    const history = await asUser(db, ADMIN, (tx) =>
      tx.query<{ action: string; actor_handle: string; detail: { note: string; days: number } }>(
        "select * from member_sanction_history($1)", [MEMBER]));
    expect(history.rows[0]).toMatchObject({ action: "suspend", actor_handle: "wolf1", detail: { note: "반복 위반", days: 7 } });
    await expect(asUser(db, MEMBER, (tx) => tx.query("select * from member_sanction_history($1)", [MEMBER]))).rejects.toThrow(/admin_only/);
  });

  it("운영자 조치(게시 중단)는 정지된 회원의 글에도 된다", async () => {
    await suspend();
    await asUser(db, ADMIN, (tx) => tx.query("select moderate_post($1, 'hide', '위반')", [MINE]));
  });
});
