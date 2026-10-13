import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000000a01";

let db: PGlite;

// 촬영일 → 게시물 id 마지막 두 자리
const SHOTS: [string, string, string?][] = [
  ["2025-10-13", "01"], // 1년 전 오늘
  ["2023-10-11", "02"], // 3년 전, 이틀 차이
  ["2024-10-20", "03"], // 7일 차이 → 빠짐
  ["2026-10-12", "04"], // 올해 → 빠짐
  ["2025-12-30", "05"], // 연말 (기준 1/2)
  ["2024-02-29", "06"], // 윤일 (기준 2/28)
  ["2024-10-13", "07", "held"], // 임시 비공개 → 빠짐
  ["2024-10-13", "08", "draft"], // 초안 → 빠짐
];

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values ('${AUTHOR}', 'author1', '작가', 'member', true);
  `);
  for (const [shotOn, n, state] of SHOTS) {
    const id = `80000000-0000-4000-8000-0000000000${n}`;
    await db.query(
      "insert into public.posts (id, author_id, title, category, shot_year, shot_on, has_people) values ($1, $2, $3, 'landscape', $4, $5, false)",
      [id, AUTHOR, n, Number(shotOn.slice(0, 4)), shotOn],
    );
    await db.query("insert into public.photos (post_id, position, width, height, bytes) values ($1, 0, 100, 100, 1000)", [id]);
    if (state !== "draft") await db.query("update public.posts set status = 'published' where id = $1", [id]);
    if (state === "held") await db.query("update public.posts set held_at = now() where id = $1", [id]);
  }
});

const onThisDay = async (target: string) =>
  (
    await asUser(db, null, (tx) =>
      tx.query<{ post_id: string; years_ago: number }>("select * from public.on_this_day($1::date)", [target]),
    )
  ).rows.map((r) => [r.post_id.slice(-2), r.years_ago]);

describe("N년 전 이맘때", () => {
  it("앞뒤 3일 안의 예전 해 게시물만, 가까운 해부터", async () => {
    expect(await onThisDay("2026-10-13")).toEqual([
      ["01", 1],
      ["02", 3],
    ]);
  });

  it("해를 넘나드는 날짜도 맞춘다", async () => {
    expect(await onThisDay("2027-01-02")).toEqual([["05", 1]]);
  });

  it("윤일 사진은 평년에 2월 28일 근처로 나온다", async () => {
    expect(await onThisDay("2025-02-28")).toEqual([["06", 1]]);
  });

  it("며칠 전 사진은 '1년 전'이 아니다", async () => {
    expect(await onThisDay("2025-10-15")).toEqual([]);
  });
});
