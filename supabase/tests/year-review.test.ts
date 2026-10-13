import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000000b01";
const FRIEND = "00000000-0000-4000-8000-000000000b02";
const P = (n: string) => `90000000-0000-4000-8000-0000000000${n}`;

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${FRIEND}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ME}', 'me1', '나', 'member', true), ('${FRIEND}', 'friend1', '친구', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, shot_on, has_people) values
      ('${P("01")}', '${ME}', '봄', 'landscape', 2026, '2026-04-05', false),
      ('${P("02")}', '${ME}', '여름', 'cosplay', 2026, '2026-07-20', false),
      ('${P("03")}', '${ME}', '날짜 모름', 'landscape', 2026, null, false),
      ('${P("04")}', '${ME}', '작년', 'landscape', 2025, '2025-05-01', false),
      ('${P("05")}', '${ME}', '초안', 'landscape', 2026, '2026-08-01', false),
      ('${P("06")}', '${FRIEND}', '친구 글', 'model', 2026, '2026-09-09', false);
    insert into public.photos (post_id, position, width, height, bytes)
      select id, 0, 100, 100, 1000 from public.posts;
    insert into public.photos (post_id, position, width, height, bytes) values ('${P("01")}', 1, 100, 100, 1000);
    update public.posts set status = 'published' where id <> '${P("05")}';
    insert into public.credits (post_id, role, member_id, status) values
      ('${P("02")}', 'photographer', '${FRIEND}', 'approved'),
      ('${P("06")}', 'photographer', '${ME}', 'approved');
    insert into public.tags (slug, name, kind, status) values ('sakura', '벚꽃', 'general', 'official');
    insert into public.post_tags (post_id, tag_id) select '${P("01")}', id from public.tags where slug = 'sakura';
  `);
});

const review = (user: string | null, year = 2026) =>
  asUser(db, user, async (tx) => (await tx.query<{ r: Record<string, unknown> | null }>("select public.my_year_review($1) as r", [year])).rows[0]!.r);

describe("나의 한 해", () => {
  it("촬영 연도 기준으로 게시된 내 글만 센다", async () => {
    const r = await review(ME);
    expect(r).toMatchObject({
      year: 2026,
      posts: 3,
      photos: 4,
      months: { "4": 1, "7": 1 },
      undated: 1,
      categories: { landscape: 2, cosplay: 1 },
      top_tags: [{ slug: "sakura", name: "벚꽃", kind: "general", count: 1 }],
      credited_in: 1,
      partners: [{ handle: "friend1", count: 2 }],
      first_post: P("01"),
      last_post: P("02"),
    });
  });

  it("글이 없는 해는 0", async () => {
    expect(await review(ME, 2020)).toMatchObject({ posts: 0, photos: 0, months: {}, partners: [], first_post: null });
  });

  it("비로그인은 부를 수 없다", async () => {
    await expect(review(null)).rejects.toThrow(/permission denied/);
  });
});
