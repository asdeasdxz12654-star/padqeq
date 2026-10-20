import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000002501";
const FAN = "00000000-0000-4000-8000-000000002502";
const FAN2 = "00000000-0000-4000-8000-000000002503";
const POST = "fb000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${FAN}'), ('${FAN2}');
    insert into public.profiles (id, handle, display_name, role) values
      ('${AUTHOR}', 'author_p', '작가', 'member'), ('${FAN}', 'fan_p1', '팬', 'member'), ('${FAN2}', 'fan_p2', '팬2', 'member');
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values ('${POST}', '${AUTHOR}', '글', 'landscape', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id = '${POST}';
  `);
});

async function like(user: string) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    await db.query("insert into post_likes (post_id, user_id) values ($1, auth.uid())", [POST]);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const likeAlerts = async () =>
  (await db.query<{ pushed: boolean }>("select pushed_at is not null as pushed from notifications where recipient_id = $1 and kind::text = 'post_liked' order by id", [AUTHOR])).rows.map((r) => r.pushed);

describe("알림 종류별 받기", () => {
  it("같은 글 좋아요는 안 읽은 알림 하나로 모인다 (화면에서 'N명' 묶기)", async () => {
    await like(FAN);
    await like(FAN2);
    expect(await likeAlerts()).toHaveLength(1);
  });

  it("좋아요 알림을 끄면 만들지 않는다 (본인 설정만)", async () => {
    await asUser(db, AUTHOR, (tx) => tx.query("insert into notification_prefs (user_id, likes) values ($1, false)", [AUTHOR]));
    await db.query("insert into public.notification_prefs (user_id, likes) values ($1, false)", [AUTHOR]);
    await like(FAN);
    expect(await likeAlerts()).toEqual([]);
    await expect(asUser(db, FAN, (tx) => tx.query("insert into notification_prefs (user_id, likes) values ($1, false)", [AUTHOR]))).rejects.toThrow(/row-level security/);
  });

  it("끌 수 없는 알림(운영 안내 등)은 설정과 상관없이 간다", async () => {
    await db.query("insert into public.notification_prefs (user_id, likes, comments, messages, events) values ($1, false, false, false, false)", [AUTHOR]);
    await db.query("insert into public.notifications (recipient_id, kind, post_id) values ($1, 'post_hidden', $2)", [AUTHOR, POST]);
    expect((await db.query("select 1 from notifications where recipient_id = $1", [AUTHOR])).rows).toHaveLength(1);
  });
});
