import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000003801";
const OTHER = "00000000-0000-4000-8000-000000003802";
const ADMIN = "00000000-0000-4000-8000-000000003803";
const MINE = "f3800000-0000-4000-8000-000000000001";
const THEIRS = "f3800000-0000-4000-8000-000000000002";
const PUBLIC_C = "f3810000-0000-4000-8000-000000000001";
const PRIVATE_C = "f3810000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${OTHER}'), ('${ADMIN}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ME}', 'me38', '나', 'member', true), ('${OTHER}', 'other38', '남', 'member', true), ('${ADMIN}', 'admin38', '운영', 'admin', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${MINE}', '${ME}', '내 글', 'landscape', 2026, false),
      ('${THEIRS}', '${OTHER}', '남의 글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published';
    insert into public.collections (id, owner_id, title, is_public) values
      ('${PUBLIC_C}', '${ME}', '여름', true), ('${PRIVATE_C}', '${ME}', '비밀', false);
  `);
});

const today = async () => (await db.query<{ d: string }>("select ((now() at time zone 'Asia/Seoul')::date)::text as d")).rows[0]!.d;
const plusDays = async (n: number) =>
  (await db.query<{ d: string }>("select ((now() at time zone 'Asia/Seoul')::date + $1::int)::text as d", [n])).rows[0]!.d;

describe("사진 대표 색 · 뒷면 메모", () => {
  it("색은 #rrggbb만", async () => {
    await db.exec(`update photos set color = '#a1b2c3' where post_id = '${MINE}'`);
    await expect(db.exec(`update photos set color = 'red' where post_id = '${MINE}'`)).rejects.toThrow(/check/);
  });

  it("뒷면 메모는 작가만 고치고, 200자까지 (줄바꿈은 된다)", async () => {
    await asUser(db, ME, (tx) => tx.query("update photos set back_memo = $1 where post_id = $2", ["첫 줄\n둘째 줄", MINE]));
    const mine = await asUser(db, ME, async (tx) => {
      await tx.query("update photos set back_memo = $1 where post_id = $2", ["첫 줄\n둘째 줄", MINE]);
      return (await tx.query<{ back_memo: string }>("select back_memo from photos where post_id = $1", [MINE])).rows[0]!.back_memo;
    });
    expect(mine).toBe("첫 줄\n둘째 줄");
    const theirs = await asUser(db, ME, async (tx) => {
      await tx.query("update photos set back_memo = '몰래' where post_id = $1", [THEIRS]);
      return (await tx.query<{ back_memo: string }>("select back_memo from photos where post_id = $1", [THEIRS])).rows[0]!.back_memo;
    });
    expect(theirs).toBe("");
    await expect(db.exec(`update photos set back_memo = repeat('가', 201) where post_id = '${MINE}'`)).rejects.toThrow(/check/);
  });
});

describe("전시", () => {
  const exhibit = (user: string, id: string, on: boolean) =>
    asUser(db, user, (tx) => tx.query("select set_exhibition($1, $2, '여름의 바다')", [id, on]));

  it("운영자만 공개 컬렉션을 건다 (감사 로그)", async () => {
    await expect(exhibit(ME, PUBLIC_C, true)).rejects.toThrow(/admin_only/);
    await expect(exhibit(ADMIN, PRIVATE_C, true)).rejects.toThrow(/collection_not_public/);
    await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [ADMIN]);
      await tx.query("select set_exhibition($1, true, '여름의 바다')", [PUBLIC_C]);
    });
    const row = (await db.query<{ exhibited_at: string | null; exhibit_note: string }>("select exhibited_at, exhibit_note from collections where id = $1", [PUBLIC_C])).rows[0]!;
    expect(row.exhibited_at).not.toBeNull();
    expect(row.exhibit_note).toBe("여름의 바다");
    expect((await db.query("select 1 from private.audit_log where action = 'exhibit'")).rows).toHaveLength(1);
  });

  it("비공개로 바꾸면 전시에서 내려간다", async () => {
    await db.exec(`update collections set exhibited_at = now(), exhibit_note = '메모' where id = '${PUBLIC_C}'`);
    await db.exec(`update collections set is_public = false where id = '${PUBLIC_C}'`);
    expect((await db.query<{ exhibited_at: string | null }>("select exhibited_at from collections where id = $1", [PUBLIC_C])).rows[0]!.exhibited_at).toBeNull();
  });

  it("주인은 전시 표시를 직접 바꿀 수 없다", async () => {
    await expect(asUser(db, ME, (tx) => tx.query("update collections set exhibited_at = now() where id = $1", [PUBLIC_C]))).rejects.toThrow(/permission denied/);
  });
});

describe("타임캡슐", () => {
  const bury = (user: string, post: string, openOn: string, letter = "10년 뒤의 나에게") =>
    asUser(db, user, (tx) => tx.query<{ id: string }>("select bury_time_capsule($1, $2, $3::date) as id", [post, letter, openOn]));

  it("내 글에만, 내일부터 10년 뒤까지 묻는다", async () => {
    expect((await bury(ME, MINE, await plusDays(365))).rows[0]!.id).toBeTruthy();
    await expect(bury(ME, THEIRS, await plusDays(365))).rejects.toThrow(/post_not_mine/);
    await expect(bury(ME, MINE, await today())).rejects.toThrow(/open_on_invalid/);
    await expect(bury(ME, MINE, await plusDays(3700))).rejects.toThrow(/open_on_invalid/);
    await expect(bury(ME, MINE, await plusDays(30), "   ")).rejects.toThrow(/check/);
  });

  it("열리기 전에는 나도 편지를 못 읽고, 남은 있는 줄도 모른다", async () => {
    await db.query("insert into time_capsules (owner_id, post_id, letter, open_on) values ($1, $2, '비밀 편지', $3::date)", [ME, MINE, await plusDays(30)]);
    const mine = await asUser(db, ME, (tx) => tx.query<{ letter: string | null }>("select letter from my_time_capsules()"));
    expect(mine.rows).toEqual([{ letter: null }]);
    await expect(asUser(db, ME, (tx) => tx.query("select letter from time_capsules"))).rejects.toThrow(/permission denied/);
    expect((await asUser(db, OTHER, (tx) => tx.query("select id from time_capsules"))).rows).toHaveLength(0);
    expect((await asUser(db, OTHER, (tx) => tx.query("select id from my_time_capsules()"))).rows).toHaveLength(0);
  });

  it("여는 날이 되면 편지가 보이고, 새벽 작업이 한 번만 알린다", async () => {
    await db.query("insert into time_capsules (owner_id, post_id, letter, open_on) values ($1, $2, '열린 편지', $3::date)", [ME, MINE, await today()]);
    await db.query("insert into time_capsules (owner_id, post_id, letter, open_on) values ($1, $2, '아직', $3::date)", [ME, MINE, await plusDays(1)]);
    const send = async () => (await db.query<{ n: number }>("select private.send_time_capsules() as n")).rows[0]!.n;
    expect(await send()).toBe(1);
    expect(await send()).toBe(0);
    expect((await db.query("select recipient_id, post_id from notifications where kind = 'time_capsule'")).rows).toEqual([{ recipient_id: ME, post_id: MINE }]);
    const letters = await asUser(db, ME, (tx) => tx.query<{ letter: string | null }>("select letter from my_time_capsules() order by open_on"));
    expect(letters.rows.map((r) => r.letter)).toEqual(["열린 편지", null]);
  });

  it("새벽 작업은 DB 관리자 연결만", async () => {
    await expect(asUser(db, ME, (tx) => tx.query("select private.send_time_capsules()"))).rejects.toThrow(/permission denied/);
  });
});
