import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000004301";
let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values ('${ME}', 'me43', '나', 'member', true);
  `);
});

describe("분류 '여행'", () => {
  it("여행 분류로 글을 만들 수 있고, 순서는 기타 앞", async () => {
    await db.exec(`insert into public.posts (author_id, title, category, shot_year, has_people) values ('${ME}', '교토', 'travel', 2026, false)`);
    const order = await db.query<{ v: string }>("select unnest(enum_range(null::public.post_category))::text as v");
    expect(order.rows.map((r) => r.v)).toEqual(["cosplay", "model", "landscape", "travel", "other"]);
  });

  it("관심 분야는 다섯 개까지", async () => {
    await db.exec(`update public.profiles set interest_categories = '{cosplay,model,landscape,travel,other}' where id = '${ME}'`);
    await expect(
      db.exec(`update public.profiles set interest_categories = '{cosplay,model,landscape,travel,other,other}' where id = '${ME}'`),
    ).rejects.toThrow(/interest_categories_check/);
  });
});
