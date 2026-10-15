import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-000000002501";
const AUTHOR = "00000000-0000-4000-8000-000000002502";
const FAN = "00000000-0000-4000-8000-000000002503";
const FAN2 = "00000000-0000-4000-8000-000000002504";
const FAN3 = "00000000-0000-4000-8000-000000002505";
const A = "fb000000-0000-4000-8000-000000000001";
const B = "fb000000-0000-4000-8000-000000000002";
const C = "fb000000-0000-4000-8000-000000000003";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${AUTHOR}'), ('${FAN}'), ('${FAN2}'), ('${FAN3}');
    insert into public.profiles (id, handle, display_name, role) values
      ('${ADMIN}', 'wolf1', '운영자', 'admin'), ('${AUTHOR}', 'author1', '작가', 'member'),
      ('${FAN}', 'fan1', '팬', 'member'), ('${FAN2}', 'fan2', '팬2', 'member'), ('${FAN3}', 'fan3', '팬3', 'member');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${A}', '${AUTHOR}', '가', 'landscape', 2026, false),
      ('${B}', '${AUTHOR}', '나', 'landscape', 2026, false),
      ('${C}', '${AUTHOR}', '다', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published';
    insert into public.post_likes (post_id, user_id, created_at) values
      ('${A}', '${FAN}', now() - interval '1 day'),
      ('${B}', '${FAN}', now() - interval '2 days'), ('${B}', '${FAN2}', now() - interval '2 days'),
      ('${C}', '${FAN}', now() - interval '40 days'), ('${C}', '${FAN2}', now() - interval '40 days'), ('${C}', '${FAN3}', now() - interval '40 days');
  `);
});

const popular = (user: string | null, days = 30) =>
  asUser(db, user, (tx) => tx.query<{ post_id: string; likes: number }>("select post_id, likes from popular_posts($1)", [days])).then((r) => r.rows);

describe("인기순", () => {
  it("기간 안에 받은 좋아요 수로 줄 세운다", async () => {
    expect(await popular(null)).toEqual([
      { post_id: B, likes: 2 },
      { post_id: A, likes: 1 },
    ]);
    expect((await popular(FAN, 90)).map((r) => r.post_id)).toEqual([C, B, A]);
  });

  it("동점이면 최근에 받은 글이 먼저", async () => {
    await db.exec(`insert into public.post_likes (post_id, user_id) values ('${A}', '${FAN2}')`);
    expect((await popular(null)).map((r) => r.post_id)).toEqual([A, B]);
  });

  it("임시 비공개 · 휴지통 글은 빠지고, 운영자에게도 같다", async () => {
    await db.exec(`update public.posts set held_at = now() where id = '${B}'`);
    expect((await popular(null)).map((r) => r.post_id)).toEqual([A]);
    await db.exec(`update public.posts set held_at = null where id = '${B}'`);
    await db.exec(`update public.posts set trashed_at = now() where id = '${A}'`);
    expect((await popular(ADMIN)).map((r) => r.post_id)).toEqual([B]);
  });

  it("탈퇴 유예 회원의 좋아요는 세지 않는다", async () => {
    await db.exec(`update public.profiles set deletion_requested_at = now() where id = '${FAN2}'`);
    expect(await popular(null)).toEqual([
      { post_id: A, likes: 1 },
      { post_id: B, likes: 1 },
    ]);
  });
});
