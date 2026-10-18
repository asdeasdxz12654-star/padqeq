import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000004001";
const APRIL_A = "f4000000-0000-4000-8000-000000000001";
const APRIL_B = "f4000000-0000-4000-8000-000000000002";
const JULY = "f4000000-0000-4000-8000-000000000003";
const NO_DATE = "f4000000-0000-4000-8000-000000000004";
const DRAFT = "f4000000-0000-4000-8000-000000000005";

let db: PGlite;

type Row = { month: number; posts: string; photos: string };
const SQL = `select * from public.author_year_months('${AUTHOR}', 2026)`;
const months = async () => (await asUser(db, AUTHOR, async (tx) => (await tx.query<Row>(SQL)).rows)).map((r) => ({
  month: r.month,
  posts: Number(r.posts),
  photos: Number(r.photos),
}));

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${AUTHOR}', 'author40', '작가', 'member', true);
    insert into public.posts (id, author_id, title, category, shot_year, shot_on, has_people) values
      ('${APRIL_A}', '${AUTHOR}', '벚꽃 1', 'landscape', 2026, '2026-04-06', false),
      ('${APRIL_B}', '${AUTHOR}', '벚꽃 2', 'landscape', 2026, '2026-04-20', false),
      ('${JULY}', '${AUTHOR}', '여름', 'landscape', 2026, '2026-07-01', false),
      ('${NO_DATE}', '${AUTHOR}', '날짜 없음', 'landscape', 2026, null, false),
      ('${DRAFT}', '${AUTHOR}', '아직 안 올림', 'landscape', 2026, '2026-04-10', false);
    insert into public.photos (post_id, position, width, height, bytes) values
      ('${APRIL_A}', 0, 100, 100, 1000), ('${APRIL_A}', 1, 100, 100, 1000),
      ('${APRIL_B}', 0, 100, 100, 1000),
      ('${JULY}', 0, 100, 100, 1000),
      ('${NO_DATE}', 0, 100, 100, 1000),
      ('${DRAFT}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id <> '${DRAFT}';
  `);
});

describe("연도 책 달 목차", () => {
  it("촬영한 달만, 달 순서대로 나온다", async () => {
    expect((await months()).map((m) => m.month)).toEqual([4, 7]);
  });

  it("달마다 글 수와 사진 장수를 센다", async () => {
    const [april, july] = await months();
    expect(april).toEqual({ month: 4, posts: 2, photos: 3 });
    expect(july).toEqual({ month: 7, posts: 1, photos: 1 });
  });

  it("촬영 날짜를 적지 않은 글은 어느 달에도 들어가지 않는다", async () => {
    const total = (await months()).reduce((n, m) => n + m.posts, 0);
    // 게시된 글 4개 중 날짜 있는 3개만
    expect(total).toBe(3);
  });

  it("게시하지 않은 글은 세지 않는다", async () => {
    const april = (await months()).find((m) => m.month === 4);
    expect(april?.posts).toBe(2);
  });

  it("사진이 없는 해는 빈 목록", async () => {
    const rows = await asUser(db, AUTHOR, async (tx) =>
      (await tx.query<Row>(`select * from public.author_year_months('${AUTHOR}', 2019)`)).rows,
    );
    expect(rows).toEqual([]);
  });
});
