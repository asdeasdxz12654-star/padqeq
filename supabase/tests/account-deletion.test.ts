import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-0000000000c1";
const LEAVER = "00000000-0000-4000-8000-0000000000c2";
const VIEWER = "00000000-0000-4000-8000-0000000000c3";
const ADMIN_POST = "40000000-0000-4000-8000-000000000001";
const LEAVER_POST = "40000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${LEAVER}'), ('${VIEWER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'operator1', '운영', 'admin', true),
      ('${LEAVER}', 'leaver1', '떠남', 'member', true),
      ('${VIEWER}', 'viewer1', '보는이', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${ADMIN_POST}', '${ADMIN}', '운영 글', 'landscape', 2026, false),
      ('${LEAVER_POST}', '${LEAVER}', '떠나는 글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values
      ('${ADMIN_POST}', 0, 100, 100, 1000), ('${LEAVER_POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published';
    insert into public.credits (post_id, role, member_id, status) values ('${ADMIN_POST}', 'model', '${LEAVER}', 'approved');
  `);
});

const requestDeletion = (user: string) =>
  db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false); select public.request_account_deletion(); reset role; select set_config('request.jwt.claim.sub', '', false);`);

describe("계정 삭제", () => {
  it("요청하면 다른 사람에게 프로필 · 게시물이 안 보인다 (본인은 본다)", async () => {
    await requestDeletion(LEAVER);
    const seenBy = (user: string | null) =>
      asUser(db, user, async (tx) => ({
        profile: (await tx.query("select 1 from profiles where id = $1", [LEAVER])).rows.length,
        post: (await tx.query("select 1 from posts where id = $1", [LEAVER_POST])).rows.length,
      }));
    expect(await seenBy(VIEWER)).toEqual({ profile: 0, post: 0 });
    expect(await seenBy(null)).toEqual({ profile: 0, post: 0 });
    expect(await seenBy(LEAVER)).toEqual({ profile: 1, post: 1 });
  });

  it("취소하면 다시 보인다", async () => {
    await requestDeletion(LEAVER);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${LEAVER}', false); select public.cancel_account_deletion(); reset role; select set_config('request.jwt.claim.sub', '', false);`);
    expect((await asUser(db, VIEWER, (tx) => tx.query("select 1 from posts where id = $1", [LEAVER_POST]))).rows).toHaveLength(1);
  });

  it("회원은 삭제 요청 시각을 직접 바꿀 수 없다", async () => {
    await expect(
      asUser(db, LEAVER, (tx) => tx.query("update profiles set deletion_requested_at = null where id = $1", [LEAVER])),
    ).rejects.toThrow(/permission denied/);
  });

  it("영구 삭제 함수는 API 역할이 부를 수 없다", async () => {
    await expect(asUser(db, ADMIN, (tx) => tx.query("select * from private.purge_deleted_accounts()"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("30일이 지나면 삭제되고, 남의 글 속 크레딧은 '탈퇴한 회원'으로 남는다", async () => {
    await requestDeletion(LEAVER);
    // 유예 기간 안에는 지우지 않는다
    expect((await db.query("select * from private.purge_deleted_accounts()")).rows).toEqual([]);
    await db.exec(`update profiles set deletion_requested_at = now() - interval '31 days' where id = '${LEAVER}'`);
    const result = await db.query<{ outcome: string }>("select outcome from private.purge_deleted_accounts()");
    expect(result.rows).toEqual([{ outcome: "purged" }]);
    expect((await db.query("select 1 from profiles where id = $1", [LEAVER])).rows).toHaveLength(0);
    expect((await db.query("select 1 from posts where id = $1", [LEAVER_POST])).rows).toHaveLength(0);
    const credit = await db.query("select member_id, status::text, external_label from credits where post_id = $1", [ADMIN_POST]);
    expect(credit.rows).toEqual([{ member_id: null, status: "external", external_label: "탈퇴한 회원" }]);
  });

  it("운영자 계정은 자동 삭제하지 않고 건너뛴다", async () => {
    await requestDeletion(ADMIN);
    await db.exec(`update profiles set deletion_requested_at = now() - interval '31 days' where id = '${ADMIN}'`);
    const result = await db.query<{ outcome: string }>("select outcome from private.purge_deleted_accounts()");
    expect(result.rows).toEqual([{ outcome: "skipped_manual_review" }]);
    expect((await db.query("select 1 from profiles where id = $1", [ADMIN])).rows).toHaveLength(1);
  });
});
