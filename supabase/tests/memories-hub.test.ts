import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000002601";
const COSER = "00000000-0000-4000-8000-000000002602";
const FAN = "00000000-0000-4000-8000-000000002603";
const OFF = "00000000-0000-4000-8000-000000002604";
const OLD = "fc000000-0000-4000-8000-000000000001";
const NEW = "fc000000-0000-4000-8000-000000000002";
const DRAFT = "fc000000-0000-4000-8000-000000000003";
const TAG = "fc100000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${COSER}'), ('${FAN}'), ('${OFF}');
    insert into public.profiles (id, handle, display_name, can_upload, memory_alerts) values
      ('${AUTHOR}', 'author1', '작가', true, true), ('${COSER}', 'coser1', '코스어', false, true),
      ('${FAN}', 'fan1', '팬', false, true), ('${OFF}', 'off1', '끔', true, false);
    insert into public.posts (id, author_id, title, category, shot_year, shot_on, has_people) values
      ('${OLD}', '${AUTHOR}', '3년 전 오늘', 'cosplay', 2023, ((now() at time zone 'Asia/Seoul')::date - interval '3 years')::date, false),
      ('${NEW}', '${AUTHOR}', '최근 글', 'cosplay', 2026, null, false),
      ('${DRAFT}', '${AUTHOR}', '초안', 'cosplay', 2023, ((now() at time zone 'Asia/Seoul')::date - interval '3 years')::date, false);
    insert into public.photos (post_id, position, width, height, bytes) select id, 0, 100, 100, 1000 from public.posts;
    update public.posts set status = 'published' where id <> '${DRAFT}';
    insert into public.credits (post_id, role, member_id, status) values ('${OLD}', 'cosplayer', '${COSER}', 'approved');
    insert into public.tags (id, kind, slug, name, status) values ('${TAG}', 'work', 'genshin', '원신', 'official');
  `);
});

async function as(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await db.query(sql, params);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const memoryKinds = async (user: string) =>
  (await db.query<{ post_id: string }>("select post_id from notifications where recipient_id = $1 and kind = 'memory_today'", [user])).rows;

describe("N년 전 오늘 알림", () => {
  it("올렸거나 크레딧된 사람에게 하루 한 번 보낸다", async () => {
    expect((await db.query<{ n: number }>("select private.send_memory_alerts() as n")).rows[0]!.n).toBe(2);
    expect(await memoryKinds(AUTHOR)).toEqual([{ post_id: OLD }]);
    expect(await memoryKinds(COSER)).toEqual([{ post_id: OLD }]);
    expect(await memoryKinds(FAN)).toEqual([]);
    expect((await db.query<{ n: number }>("select private.send_memory_alerts() as n")).rows[0]!.n).toBe(0);
  });

  it("설정에서 끄면 보내지 않는다", async () => {
    await db.exec(`update posts set author_id = '${OFF}' where id = '${OLD}'; delete from credits;`);
    expect((await db.query<{ n: number }>("select private.send_memory_alerts() as n")).rows[0]!.n).toBe(0);
  });
});

describe("촬영 정보", () => {
  it("정해진 칸만, 공개 전 사진에만 넣는다", async () => {
    const photo = (await db.query<{ id: string }>("select id from photos where post_id = $1", [DRAFT])).rows[0]!.id;
    const entries = (exif: unknown) => JSON.stringify([{ photo_id: photo, exif }]);
    await as(AUTHOR, "select set_photo_exif($1, $2::jsonb)", [DRAFT, entries({ camera: "Sony α7 IV", lens: "FE 85mm F1.4 GM", aperture: "f/1.8", iso: "200" })]);
    expect((await db.query<{ exif: { camera: string } }>("select exif from photos where id = $1", [photo])).rows[0]!.exif.camera).toBe("Sony α7 IV");
    await expect(as(AUTHOR, "select set_photo_exif($1, $2::jsonb)", [DRAFT, entries({ gps: "37.5,127" })])).rejects.toThrow(/exif_invalid/);
    await expect(as(FAN, "select set_photo_exif($1, $2::jsonb)", [DRAFT, entries({ camera: "x" })])).rejects.toThrow(/post_not_editable/);
  });

  it("하루의 빛은 정해진 네 가지 이름만", async () => {
    const photo = (await db.query<{ id: string }>("select id from photos where post_id = $1", [DRAFT])).rows[0]!.id;
    const entries = (exif: unknown) => JSON.stringify([{ photo_id: photo, exif }]);
    await as(AUTHOR, "select set_photo_exif($1, $2::jsonb)", [DRAFT, entries({ camera: "Sony α7 IV", light: "golden" })]);
    expect((await db.query<{ exif: { light: string } }>("select exif from photos where id = $1", [photo])).rows[0]!.exif.light).toBe("golden");
    await expect(as(AUTHOR, "select set_photo_exif($1, $2::jsonb)", [DRAFT, entries({ light: "18:42" })])).rejects.toThrow(/exif_invalid/);
  });
});

describe("태그 허브", () => {
  beforeEach(async () => {
    await db.exec(`insert into post_tags (post_id, tag_id) values ('${OLD}', '${TAG}'), ('${NEW}', '${TAG}')`);
  });

  it("인기: 최근 좋아요가 많은 순", async () => {
    await as(FAN, "insert into post_likes (post_id, user_id) values ($1, auth.uid())", [NEW]);
    await as(COSER, "insert into post_likes (post_id, user_id) values ($1, auth.uid())", [NEW]);
    await as(FAN, "insert into post_likes (post_id, user_id) values ($1, auth.uid())", [OLD]);
    const rows = await asUser(db, null, (tx) => tx.query<{ post_id: string; likes: number }>("select * from tag_popular_posts($1)", [TAG]));
    expect(rows.rows).toEqual([
      { post_id: NEW, likes: 2 },
      { post_id: OLD, likes: 1 },
    ]);
  });

  it("코스어: 코스어로 승인된 회원", async () => {
    const rows = await asUser(db, null, (tx) => tx.query("select * from tag_cosers($1)", [TAG]));
    expect(rows.rows).toEqual([{ handle: "coser1", display_name: "코스어", posts: 1 }]);
  });
});
