import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000001101";
const AUTHOR = "00000000-0000-4000-8000-000000001102";
const PUBLISHED = "e0000000-0000-4000-8000-000000000001";
const DRAFT = "e0000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${AUTHOR}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ME}', 'me1', '나', 'member', false), ('${AUTHOR}', 'author1', '작가', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${PUBLISHED}', '${AUTHOR}', '공개', 'landscape', 2026, false),
      ('${DRAFT}', '${AUTHOR}', '초안', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${PUBLISHED}', 0, 100, 100, 1000), ('${DRAFT}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id = '${PUBLISHED}';
  `);
});

const save = (user: string, post: string) =>
  asUser(db, user, (tx) => tx.query("insert into bookmarks (user_id, post_id) values ($1, $2)", [user, post]));

describe("저장", () => {
  it("게시된 글을 저장하고 내 목록에서만 본다", async () => {
    const mine = await asUser(db, ME, async (tx) => {
      await tx.query("insert into bookmarks (user_id, post_id) values ($1, $2)", [ME, PUBLISHED]);
      return (await tx.query("select post_id from bookmarks")).rows;
    });
    expect(mine).toEqual([{ post_id: PUBLISHED }]);
    await db.query("insert into bookmarks (user_id, post_id) values ($1, $2)", [ME, PUBLISHED]);
    // 작성자도 누가 저장했는지 볼 수 없다
    expect((await asUser(db, AUTHOR, (tx) => tx.query("select 1 from bookmarks"))).rows).toHaveLength(0);
  });

  it("볼 수 없는 글(남의 초안)은 저장할 수 없다", async () => {
    await expect(save(ME, DRAFT)).rejects.toThrow(/row-level security/);
  });

  it("남 대신 저장할 수 없고, 비로그인은 볼 수 없다", async () => {
    await expect(
      asUser(db, ME, (tx) => tx.query("insert into bookmarks (user_id, post_id) values ($1, $2)", [AUTHOR, PUBLISHED])),
    ).rejects.toThrow(/row-level security/);
    await expect(asUser(db, null, (tx) => tx.query("select 1 from bookmarks"))).rejects.toThrow(/permission denied/);
  });
});
