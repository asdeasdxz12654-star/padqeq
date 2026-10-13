import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000000d01";
const OTHER = "00000000-0000-4000-8000-000000000d02";
const POST = "b0000000-0000-4000-8000-000000000001";
const PH = (n: number) => `b1000000-0000-4000-8000-00000000000${n}`;

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${AUTHOR}', 'author1', '작가', 'member', true), ('${OTHER}', 'other1', '남', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false);
    insert into public.photos (id, post_id, position, width, height, bytes) values
      ('${PH(1)}', '${POST}', 0, 100, 100, 1000), ('${PH(2)}', '${POST}', 1, 100, 100, 1000), ('${PH(3)}', '${POST}', 2, 100, 100, 1000);
    update public.posts set status = 'published';
  `);
});

async function arrange(user: string, keep: string[]) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    await db.query("select public.arrange_my_photos($1, $2::uuid[])", [POST, keep]);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const order = async () =>
  (await db.query<{ id: string }>("select id from photos where post_id = $1 order by position", [POST])).rows.map((r) => r.id);

describe("사진 빼기 · 순서 바꾸기", () => {
  it("순서를 맞바꾸고 뺀 사진은 지운다 (파일은 정리 목록으로)", async () => {
    await arrange(AUTHOR, [PH(3), PH(1)]);
    expect(await order()).toEqual([PH(3), PH(1)]);
    expect((await db.query("select position from photos where post_id = $1 order by position", [POST])).rows).toEqual([
      { position: 0 },
      { position: 1 },
    ]);
    expect((await db.query("select 1 from private.storage_trash")).rows).toHaveLength(1);
  });

  it("사진을 모두 뺄 수 없다", async () => {
    await expect(arrange(AUTHOR, [])).rejects.toThrow(/photo_required/);
  });

  it("다른 글의 사진 · 중복은 막는다", async () => {
    await expect(arrange(AUTHOR, [PH(1), "b1000000-0000-4000-8000-000000000009"])).rejects.toThrow(/photo_not_in_post/);
    await expect(arrange(AUTHOR, [PH(1), PH(1)])).rejects.toThrow(/photo_duplicate/);
    expect(await order()).toEqual([PH(1), PH(2), PH(3)]);
  });

  it("남의 글은 바꿀 수 없다", async () => {
    await expect(arrange(OTHER, [PH(1)])).rejects.toThrow(/post_not_found/);
  });
});
