import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002801";
const P1 = "fe000000-0000-4000-8000-000000000001";
const P2 = "fe000000-0000-4000-8000-000000000002";
const P3 = "fe000000-0000-4000-8000-000000000003";
const DRAFT = "fe000000-0000-4000-8000-000000000004";

let db: PGlite;
const tag: Record<string, string> = {};

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}');
    insert into public.profiles (id, handle, display_name, role) values ('${ADMIN}', 'wolf1', '운영', 'admin');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${P1}', '${ADMIN}', '1', 'cosplay', 2026, false), ('${P2}', '${ADMIN}', '2', 'cosplay', 2026, false),
      ('${P3}', '${ADMIN}', '3', 'cosplay', 2026, false), ('${DRAFT}', '${ADMIN}', '초안', 'cosplay', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published' where id <> '${DRAFT}';
  `);
  const make = async (key: string, kind: string, parent: string | null = null, status = "official") => {
    tag[key] = (
      await db.query<{ id: string }>("insert into public.tags (kind, slug, name, parent_id, status) values ($1, $2, $2, $3, $4) returning id", [kind, key, parent, status])
    ).rows[0]!.id;
  };
  await make("genshin", "work");
  await make("raiden", "character", tag.genshin);
  await make("yae", "character", tag.genshin);
  await make("studio", "place");
  await make("sakura", "general");
  await make("secret", "general", null, "pending");
  const link = (post: string, ...keys: string[]) =>
    db.query("insert into public.post_tags (post_id, tag_id) select $1, unnest($2::uuid[])", [post, keys.map((k) => tag[k])]);
  await link(P1, "genshin", "raiden", "studio", "sakura", "secret");
  await link(P2, "genshin", "yae", "studio");
  await link(P3, "raiden", "sakura", "genshin");
  await link(DRAFT, "raiden", "yae");
});

const related = (id: string) =>
  asUser(db, null, (tx) => tx.query<{ slug: string; together: number }>("select slug, together::int from related_tags($1)", [id])).then((r) =>
    r.rows.map((x) => `${x.slug}:${x.together}`),
  );

describe("관련 태그", () => {
  it("함께 붙은 글 수 순 · 작품 허브는 자기 캐릭터를 뺀다", async () => {
    expect(await related(tag.genshin!)).toEqual(["sakura:2", "studio:2"]);
  });

  it("캐릭터 허브는 상위 작품을 빼고, 초안 · 승인 전 태그는 세지 않는다", async () => {
    expect(await related(tag.raiden!)).toEqual(["sakura:2", "studio:1"]);
  });
});
