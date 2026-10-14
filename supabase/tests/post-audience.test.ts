import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002501";
const AUTHOR = "00000000-0000-4000-8000-000000002502";
const FOLLOWER = "00000000-0000-4000-8000-000000002503";
const STRANGER = "00000000-0000-4000-8000-000000002504";
const POST = "fb000000-0000-4000-8000-000000000001";
const OTHER_POST = "fb000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${FOLLOWER}'), ('${STRANGER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin', true), ('${AUTHOR}', 'author1', '작가', 'member', true),
      ('${FOLLOWER}', 'follower1', '팔로워', 'member', false), ('${STRANGER}', 'stranger1', '남', 'member', false);
    insert into public.member_follows (follower_id, followee_id) values ('${FOLLOWER}', '${AUTHOR}');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false), ('${OTHER_POST}', '${STRANGER}', '남의 글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes, phash) select id, 0, 100, 100, 1000, 1 from public.posts;
    update public.posts set status = 'published';
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

const sees = async (user: string | null) => (await asUser(db, user, (tx) => tx.query("select 1 from posts where id = $1", [POST]))).rows.length === 1;
const who = async () => [await sees(null), await sees(STRANGER), await sees(FOLLOWER), await sees(AUTHOR), await sees(ADMIN)];

describe("공개 범위", () => {
  it("전체 · 팔로워 · 나만", async () => {
    expect(await who()).toEqual([true, true, true, true, true]);
    await as(AUTHOR, "update posts set visibility = 'followers' where id = $1", [POST]);
    expect(await who()).toEqual([false, false, true, true, true]);
    await as(AUTHOR, "update posts set visibility = 'private' where id = $1", [POST]);
    expect(await who()).toEqual([false, false, false, true, true]);
  });

  it("예약 시각이 지나야 남에게 보이고, 게시 시각도 예약 시각이 된다", async () => {
    await db.exec(`update posts set status = 'draft', published_at = null where id = '${POST}'`);
    await as(AUTHOR, "update posts set scheduled_at = now() + interval '1 day', status = 'published' where id = $1", [POST]);
    expect(await who()).toEqual([false, false, false, true, true]);
    const row = (await db.query<{ same: boolean }>("select published_at = scheduled_at as same from posts where id = $1", [POST])).rows[0]!;
    expect(row.same).toBe(true);
    await db.exec(`update posts set scheduled_at = now() - interval '1 minute' where id = '${POST}'`);
    expect(await sees(null)).toBe(true);
  });

  it("예약은 90일 안까지", async () => {
    await expect(as(AUTHOR, "update posts set status = 'draft' where id = $1; ", [POST]).then(() =>
      as(AUTHOR, "update posts set scheduled_at = now() + interval '91 days' where id = $1", [POST]),
    )).rejects.toThrow(/schedule_too_far/);
  });
});

describe("댓글 설정", () => {
  const comment = (user: string) => as(user, "insert into comments (post_id, author_id, body) values ($1, auth.uid(), '댓글')", [POST]);

  it("팔로워만 · 끄기", async () => {
    await as(AUTHOR, "update posts set comment_policy = 'followers' where id = $1", [POST]);
    await expect(comment(STRANGER)).rejects.toThrow(/row-level security/);
    await comment(FOLLOWER);
    await as(AUTHOR, "update posts set comment_policy = 'off' where id = $1", [POST]);
    await expect(comment(FOLLOWER)).rejects.toThrow(/row-level security/);
    await comment(AUTHOR);
    // 이미 달린 댓글은 그대로 보인다
    expect((await asUser(db, STRANGER, (tx) => tx.query("select 1 from comments"))).rows).toHaveLength(2);
  });
});

describe("오늘의 픽", () => {
  it("운영자만 고르고, 하루 10개까지, 볼 수 없는 글은 빠진다", async () => {
    await as(ADMIN, "insert into daily_picks (pick_date, post_id, created_by) values (current_date, $1, auth.uid())", [POST]);
    await expect(
      as(AUTHOR, "insert into daily_picks (pick_date, post_id, created_by) values (current_date, $1, auth.uid())", [OTHER_POST]),
    ).rejects.toThrow(/row-level security/);
    expect((await asUser(db, null, (tx) => tx.query("select 1 from daily_picks"))).rows).toHaveLength(1);
    await as(AUTHOR, "update posts set visibility = 'private' where id = $1", [POST]);
    expect((await asUser(db, null, (tx) => tx.query("select 1 from daily_picks"))).rows).toHaveLength(0);
  });
});

describe("프로필 꾸미기", () => {
  it("커버 · 고정은 내 글만, 링크는 https 3개까지", async () => {
    await as(AUTHOR, "update profiles set cover_post_id = $1, pinned_post_ids = array[$1]::uuid[], links = array['https://instagram.com/author1'] where id = auth.uid()", [POST]);
    await expect(as(AUTHOR, "update profiles set cover_post_id = $1 where id = auth.uid()", [OTHER_POST])).rejects.toThrow(/cover_not_mine/);
    await expect(as(AUTHOR, "update profiles set pinned_post_ids = array[$1]::uuid[] where id = auth.uid()", [OTHER_POST])).rejects.toThrow(/pin_not_mine/);
    await expect(as(AUTHOR, "update profiles set links = array['javascript:alert(1)'] where id = auth.uid()")).rejects.toThrow(/link_invalid/);
    await expect(as(AUTHOR, "update profiles set links = array['https://a.com','https://b.com','https://c.com','https://d.com'] where id = auth.uid()")).rejects.toThrow(
      /profiles_links_check/,
    );
  });

  it("미가입 표기 링크가 내 프로필 링크와 같으면 크레딧 연결이 바로 된다", async () => {
    const credit = (
      await db.query<{ id: string }>(
        "insert into credits (post_id, role, external_label, external_url, status) values ($1, 'model', '팔로워', 'https://www.instagram.com/follower1/', 'external') returning id",
        [POST],
      )
    ).rows[0]!.id;
    await as(FOLLOWER, "update profiles set links = array['https://instagram.com/Follower1'] where id = auth.uid()");
    await as(FOLLOWER, "insert into credit_claims (credit_id, claimant_id, note) values ($1, auth.uid(), '저예요')", [credit]);
    const row = (await db.query<{ member_id: string; status: string }>("select member_id, status::text from credits where id = $1", [credit])).rows[0];
    expect(row).toEqual({ member_id: FOLLOWER, status: "approved" });
  });

  it("링크가 다르면 운영자 확인을 기다린다", async () => {
    const credit = (
      await db.query<{ id: string }>(
        "insert into credits (post_id, role, external_label, external_url, status) values ($1, 'model', '팔로워', 'https://instagram.com/someone_else', 'external') returning id",
        [POST],
      )
    ).rows[0]!.id;
    await as(FOLLOWER, "update profiles set links = array['https://instagram.com/follower1'] where id = auth.uid()");
    await as(FOLLOWER, "insert into credit_claims (credit_id, claimant_id, note) values ($1, auth.uid(), '저예요')", [credit]);
    expect((await db.query<{ status: string }>("select status::text from credit_claims")).rows[0]!.status).toBe("open");
  });
});
