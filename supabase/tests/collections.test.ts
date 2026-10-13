import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000001201";
const OTHER = "00000000-0000-4000-8000-000000001202";
const MINE = "f0000000-0000-4000-8000-000000000001";
const CREDITED = "f0000000-0000-4000-8000-000000000002";
const STRANGER = "f0000000-0000-4000-8000-000000000003";
const PUBLIC_C = "f1000000-0000-4000-8000-000000000001";
const PRIVATE_C = "f1000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ME}', 'me1', '나', 'member', true), ('${OTHER}', 'other1', '남', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${MINE}', '${ME}', '내 글', 'landscape', 2026, false),
      ('${CREDITED}', '${OTHER}', '크레딧된 글', 'model', 2026, false),
      ('${STRANGER}', '${OTHER}', '남의 글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published';
    insert into public.credits (post_id, role, member_id, status) values ('${CREDITED}', 'model', '${ME}', 'approved');
    insert into public.collections (id, owner_id, title, is_public) values
      ('${PUBLIC_C}', '${ME}', ' 여름 서코 ', true), ('${PRIVATE_C}', '${ME}', '비밀', false);
  `);
});

const put = (user: string, collection: string, post: string) =>
  asUser(db, user, (tx) => tx.query("insert into collection_posts (collection_id, post_id) values ($1, $2)", [collection, post]));

describe("컬렉션", () => {
  it("제목 앞뒤 공백을 지운다", async () => {
    expect((await db.query<{ title: string }>("select title from collections where id = $1", [PUBLIC_C])).rows[0]!.title).toBe("여름 서코");
  });

  it("내 글 · 크레딧된 글은 담고, 남의 글은 담을 수 없다", async () => {
    await put(ME, PUBLIC_C, MINE);
    await put(ME, PUBLIC_C, CREDITED);
    await expect(put(ME, PUBLIC_C, STRANGER)).rejects.toThrow(/row-level security/);
  });

  it("남의 컬렉션에는 담을 수 없다", async () => {
    await expect(put(OTHER, PUBLIC_C, STRANGER)).rejects.toThrow(/row-level security/);
  });

  it("비공개 컬렉션은 나만 본다", async () => {
    const seen = async (user: string | null) =>
      (await asUser(db, user, (tx) => tx.query<{ id: string }>("select id from collections order by title"))).rows.map((r) => r.id);
    expect(await seen(ME)).toHaveLength(2);
    expect(await seen(OTHER)).toEqual([PUBLIC_C]);
    expect(await seen(null)).toEqual([PUBLIC_C]);
  });

  it("탈퇴 유예 중이면 공개 컬렉션도 남에게 안 보인다", async () => {
    await db.exec(`update profiles set deletion_requested_at = now() where id = '${ME}'`);
    expect((await asUser(db, null, (tx) => tx.query("select 1 from collections"))).rows).toHaveLength(0);
  });

  it("남이 고치거나 지울 수 없다", async () => {
    const updated = await asUser(db, OTHER, (tx) => tx.query("update collections set title = 'x' returning id"));
    expect(updated.rows).toHaveLength(0);
    const removed = await asUser(db, OTHER, (tx) => tx.query("delete from collections returning id"));
    expect(removed.rows).toHaveLength(0);
  });

  it("볼 수 없게 된 글은 컬렉션에서도 안 보인다", async () => {
    await db.query("insert into collection_posts (collection_id, post_id) values ($1, $2)", [PUBLIC_C, CREDITED]);
    await db.exec(`update posts set status = 'hidden' where id = '${CREDITED}'`);
    expect((await asUser(db, null, (tx) => tx.query("select 1 from collection_posts"))).rows).toHaveLength(0);
  });
});
