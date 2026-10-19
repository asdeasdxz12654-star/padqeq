import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const MEMBER = "00000000-0000-4000-8000-000000004201";
const COSER = "00000000-0000-4000-8000-000000004202";
const OTHER = "00000000-0000-4000-8000-000000004203";
const PEOPLE = "f4200000-0000-4000-8000-000000000001";
const LANDSCAPE = "f4200000-0000-4000-8000-000000000002";
const DRAFT = "f4200000-0000-4000-8000-000000000003";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${MEMBER}'), ('${COSER}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${MEMBER}', 'member42', '작가', 'member', true),
      ('${COSER}', 'coser42', '코스어', 'member', true),
      ('${OTHER}', 'other42', '남', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${PEOPLE}', '${MEMBER}', '라이덴', 'cosplay', 2026, true),
      ('${LANDSCAPE}', '${MEMBER}', '노을', 'landscape', 2026, false),
      ('${DRAFT}', '${MEMBER}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes, phash)
      select id, 0, 100, 100, 1000, 1 from public.posts;
    update public.posts set status = 'published' where id = '${LANDSCAPE}';
    insert into public.credits (post_id, role, member_id, status) values ('${LANDSCAPE}', 'model', '${COSER}', 'approved');
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

/** 휴지통에 넣은 지 31일 지난 것으로 (휴지통 글 보호 검사는 이 테스트 준비에서만 비켜 간다) */
const backdateTrash = (id: string) =>
  db.exec(`select set_config('haedam.author_trash', 'on', false); update public.posts set trashed_at = now() - interval '31 days' where id = '${id}'; select set_config('haedam.author_trash', '', false);`);

const publishWithConsent = (user = MEMBER, post = PEOPLE) =>
  as(user, "select publish_my_post($1, '코스어 @coser42', '2026-10-16', '메시지로 동의', false, false)", [post]);
const statusOf = async (id: string) =>
  (await db.query<{ status: string; trashed_at: string | null }>(`select status, trashed_at from public.posts where id = '${id}'`)).rows[0];

describe("회원의 인물 사진", () => {
  it("동의 기록을 적으면 회원도 게시한다 (기록은 운영자만 본다)", async () => {
    await publishWithConsent();
    expect((await statusOf(PEOPLE))!.status).toBe("published");
    const record = await db.query<{ created_by: string; source_post_id: string }>("select created_by, source_post_id from public.consent_records");
    expect(record.rows).toEqual([{ created_by: MEMBER, source_post_id: PEOPLE }]);
    const seen = await asUser(db, MEMBER, (tx) => tx.query("select id from public.consent_records"));
    expect(seen.rows).toHaveLength(0);
  });

  it("동의 기록 없이는 게시할 수 없다", async () => {
    await expect(as(MEMBER, "select publish_my_post($1)", [PEOPLE])).rejects.toThrow(/동의 기록/);
  });

  it("남의 글에는 동의 기록을 남길 수 없다", async () => {
    await expect(publishWithConsent(OTHER)).rejects.toThrow();
    expect((await db.query("select 1 from public.consent_records")).rows).toHaveLength(0);
  });

  it("게시한 인물 글에 사진을 더할 수 있다", async () => {
    await publishWithConsent();
    const entries = JSON.stringify([{ width: 100, height: 100, bytes: 1000, seed: "0".repeat(32) }]);
    const added = await as(MEMBER, "select array_length(add_my_photos($1, $2::jsonb), 1) as n", [PEOPLE, entries]);
    expect(added.rows).toEqual([{ n: 1 }]);
  });
});

describe("내 글 지우기", () => {
  it("지우면 휴지통으로, 작성자만 '지운 글'로 보고 되살린다", async () => {
    await as(MEMBER, "select delete_my_post($1)", [LANDSCAPE]);
    expect(await statusOf(LANDSCAPE)).toMatchObject({ status: "hidden" });
    expect((await statusOf(LANDSCAPE))!.trashed_at).not.toBeNull();
    const mine = await asUser(db, MEMBER, (tx) => tx.query(`select id from public.posts where id = '${LANDSCAPE}'`));
    expect(mine.rows).toHaveLength(1);
    const others = await asUser(db, OTHER, (tx) => tx.query(`select id from public.posts where id = '${LANDSCAPE}'`));
    expect(others.rows).toHaveLength(0);

    await as(MEMBER, "select restore_my_post($1)", [LANDSCAPE]);
    expect(await statusOf(LANDSCAPE)).toMatchObject({ status: "published", trashed_at: null });
  });

  it("함께 이름이 오른 회원에게 알린다", async () => {
    await as(MEMBER, "select delete_my_post($1)", [LANDSCAPE]);
    const notes = await db.query("select recipient_id, kind, actor_id, post_id from public.notifications");
    expect(notes.rows).toEqual([{ recipient_id: COSER, kind: "credited_post_deleted", actor_id: MEMBER, post_id: null }]);
  });

  it("남의 글은 지울 수 없고, 30일이 지나면 되살릴 수 없다", async () => {
    await expect(as(OTHER, "select delete_my_post($1)", [LANDSCAPE])).rejects.toThrow(/post_not_found/);
    await as(MEMBER, "select delete_my_post($1)", [LANDSCAPE]);
    await backdateTrash(LANDSCAPE);
    await expect(as(MEMBER, "select restore_my_post($1)", [LANDSCAPE])).rejects.toThrow(/restore_expired/);
  });

  it("지운 글은 고칠 수 없다 (되살리기만)", async () => {
    await as(MEMBER, "select delete_my_post($1)", [LANDSCAPE]);
    await expect(as(MEMBER, `update public.posts set title = '바꿈' where id = '${LANDSCAPE}'`)).rejects.toThrow(/post_trashed/);
  });

  it("초안은 바로 지운다", async () => {
    await as(MEMBER, "select delete_my_post($1)", [DRAFT]);
    expect(await statusOf(DRAFT)).toBeUndefined();
  });
});

describe("동의 기록 보존", () => {
  it("인물 글이 영구 삭제돼도 정리가 멈추지 않고, 기록은 3년 뒤 지운다", async () => {
    await publishWithConsent();
    await as(MEMBER, "select delete_my_post($1)", [PEOPLE]);
    await backdateTrash(PEOPLE);
    expect((await db.query<{ n: number }>("select private.purge_trashed_posts() as n")).rows[0]!.n).toBe(1);
    const kept = await db.query<{ post_id: string | null; source_post_id: string; deleted: boolean }>(
      "select post_id, source_post_id, post_deleted_at is not null as deleted from public.consent_records",
    );
    expect(kept.rows).toEqual([{ post_id: null, source_post_id: PEOPLE, deleted: true }]);

    expect((await db.query<{ n: number }>("select private.purge_old_consent_records() as n")).rows[0]!.n).toBe(0);
    await db.exec("update public.consent_records set post_deleted_at = now() - interval '3 years 1 day'");
    expect((await db.query<{ n: number }>("select private.purge_old_consent_records() as n")).rows[0]!.n).toBe(1);
  });

  it("동의 기록을 남긴 회원도 탈퇴 정리에서 지워진다 (기록은 남긴 사람 없이 남는다)", async () => {
    await publishWithConsent();
    await db.exec(`update public.profiles set deletion_requested_at = now() - interval '31 days' where id = '${MEMBER}'`);
    const result = await db.query<{ outcome: string }>("select outcome from private.purge_deleted_accounts()");
    expect(result.rows).toEqual([{ outcome: "purged" }]);
    const kept = await db.query<{ created_by: string | null; deleted: boolean }>(
      "select created_by, post_deleted_at is not null as deleted from public.consent_records",
    );
    expect(kept.rows).toEqual([{ created_by: null, deleted: true }]);
  });
});
