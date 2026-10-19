import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000003001";
const OTHER = "00000000-0000-4000-8000-000000003002";
const ME = "00000000-0000-4000-8000-000000003003";
const FAN = "00000000-0000-4000-8000-000000003004";
const OLD = "fa100000-0000-4000-8000-000000000001";
const NEW = "fa100000-0000-4000-8000-000000000002";
const LIKED = "fa100000-0000-4000-8000-000000000003";
const LANDSCAPE = "fa100000-0000-4000-8000-000000000004";
const ANCIENT = "fa100000-0000-4000-8000-000000000005";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${OTHER}'), ('${ME}'), ('${FAN}');
    insert into public.profiles (id, handle, display_name, role) values
      ('${AUTHOR}', 'author1', '작가', 'member'), ('${OTHER}', 'other1', '남', 'member'),
      ('${ME}', 'viewer1', '나', 'member'), ('${FAN}', 'fan1', '팬', 'member');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${OLD}', '${OTHER}', '20일 전', 'cosplay', 2026, false),
      ('${NEW}', '${OTHER}', '방금', 'cosplay', 2026, false),
      ('${LIKED}', '${OTHER}', '좋아요 많음', 'cosplay', 2026, false),
      ('${LANDSCAPE}', '${AUTHOR}', '풍경', 'landscape', 2026, false),
      ('${ANCIENT}', '${OTHER}', '90일 전', 'cosplay', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published';
    update public.posts set published_at = now() - interval '20 days' where id in ('${OLD}', '${LIKED}', '${LANDSCAPE}');
    update public.posts set published_at = now() - interval '90 days' where id = '${ANCIENT}';
    insert into public.post_likes (post_id, user_id) values ('${LIKED}', '${ME}'), ('${LIKED}', '${FAN}'), ('${LIKED}', '${AUTHOR}');
  `);
});

const order = (user: string | null) =>
  asUser(db, user, (tx) => tx.query<{ post_id: string }>("select post_id from recommended_posts()")).then((r) => r.rows.map((x) => x.post_id));

describe("추천 피드", () => {
  it("최근 60일 안의 글만 · 새 글 · 좋아요 받은 글이 위로", async () => {
    const list = await order(null);
    expect(list).not.toContain(ANCIENT);
    expect(list[0]).toBe(NEW);
    expect(list.indexOf(LIKED)).toBeLessThan(list.indexOf(OLD));
  });

  it("팔로우한 회원의 글 · 관심 분야는 올라간다", async () => {
    expect((await order(ME)).indexOf(LANDSCAPE)).toBeGreaterThan(1);
    await db.exec(`insert into public.member_follows (follower_id, followee_id) values ('${ME}', '${AUTHOR}');
                   update public.profiles set interest_categories = '{landscape}' where id = '${ME}'`);
    expect((await order(ME))[0]).toBe(LANDSCAPE);
    // 다른 사람의 추천 순서에는 영향 없음
    expect((await order(FAN)).indexOf(LANDSCAPE)).toBeGreaterThan(1);
  });

  it("오늘의 픽은 올라가고, 임시 비공개 글은 빠진다", async () => {
    await db.exec(`insert into public.daily_picks (pick_date, post_id) values ((now() at time zone 'Asia/Seoul')::date, '${OLD}');
                   update public.posts set held_at = now() where id = '${NEW}'`);
    const list = await order(null);
    expect(list).not.toContain(NEW);
    expect(list[0]).toBe(OLD);
  });

  it("관심 분야는 5개까지(분류 수, 20261217), 본인만 고친다", async () => {
    await expect(db.query(`update public.profiles set interest_categories = '{cosplay,model,landscape,travel,other,cosplay}' where id = '${ME}'`)).rejects.toThrow(/check/);
    await asUser(db, FAN, (tx) => tx.query(`update public.profiles set interest_categories = '{model}' where id = '${ME}'`).then((r) => expect(r.affectedRows).toBe(0)));
  });
});
