import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const UPLOADER = "00000000-0000-4000-8000-0000000000a2";
const MEMBER = "00000000-0000-4000-8000-0000000000a3";
const POST = "20000000-0000-4000-8000-000000000001";
const UP_POST = "20000000-0000-4000-8000-000000000002";

let db: PGlite;
let genshin: string;
let raiden: string;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${UPLOADER}'), ('${MEMBER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'operator1', '운영', 'admin', true),
      ('${UPLOADER}', 'uploader', '업', 'member', true),
      ('${MEMBER}', 'viewer', '감', 'member', false);
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${POST}', '${ADMIN}', '라이덴', 'cosplay', 2026, false),
      ('${UP_POST}', '${UPLOADER}', '회원 글', 'cosplay', 2026, false);
    insert into public.photos (post_id, position, width, height, bytes) values ('${POST}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id = '${POST}';
  `);
  // 운영자가 공식 태그를 만든다 (실제 저장되도록 트랜잭션 없이)
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ADMIN}', false);`);
  genshin = (await db.query<{ id: string }>("select public.create_official_tag('work', '원신', '원신', null, array['Genshin Impact', '原神']) as id")).rows[0]!.id;
  raiden = (await db.query<{ id: string }>("select public.create_official_tag('character', '라이덴-쇼군', '라이덴 쇼군', $1, array['Raiden Shogun']) as id", [genshin])).rows[0]!.id;
  await db.query("insert into public.post_tags (post_id, tag_id) values ($1, $2)", [POST, raiden]);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
});

describe("태그", () => {
  it("공식 태그와 별칭은 누구나 본다 (별칭은 대소문자 무시)", async () => {
    const rows = await asUser(db, null, (tx) =>
      tx.query<{ name: string }>(
        "select t.name from tags t join tag_aliases a on a.tag_id = t.id where a.alias::text ilike 'genshin impact'",
      ),
    );
    expect(rows.rows).toEqual([{ name: "원신" }]);
  });

  it("운영자가 아니면 공식 태그를 만들 수 없다", async () => {
    await expect(
      asUser(db, UPLOADER, (tx) => tx.query("select public.create_official_tag('work', 'x', 'x')")),
    ).rejects.toThrow(/admin_only/);
  });

  it("업로드 권한자의 제안 태그는 공식 상태로 넣을 수 없고, 남에게 안 보인다", async () => {
    await expect(
      asUser(db, UPLOADER, (tx) =>
        tx.query(`insert into tags (kind, slug, name, created_by, status) values ('work', 'fake', 'fake', '${UPLOADER}', 'official')`),
      ),
    ).rejects.toThrow(/permission denied/);

    const seen = await asUser(db, UPLOADER, async (tx) => {
      await tx.query(`insert into tags (kind, slug, name, created_by) values ('work', '블루-아카이브', '블루 아카이브', '${UPLOADER}')`);
      const mine = await tx.query("select 1 from tags where slug = '블루-아카이브'");
      await tx.query(`set local role anon`);
      await tx.query("select set_config('request.jwt.claim.sub', '', true)");
      const others = await tx.query("select 1 from tags where slug = '블루-아카이브'");
      return [mine.rows.length, others.rows.length];
    });
    expect(seen).toEqual([1, 0]);
  });

  it("감상만 하는 회원은 태그를 제안할 수 없다", async () => {
    await expect(
      asUser(db, MEMBER, (tx) => tx.query(`insert into tags (kind, slug, name, created_by) values ('work', 'y', 'y', '${MEMBER}')`)),
    ).rejects.toThrow(/row-level security/);
  });

  it("캐릭터는 작품 아래에만, 작품은 상위가 없어야 한다", async () => {
    await expect(
      asUser(db, ADMIN, (tx) => tx.query("select public.create_official_tag('character', 'z', 'z')")),
    ).rejects.toThrow(/tag_parent_rule/);
    await expect(
      asUser(db, ADMIN, (tx) => tx.query("select public.create_official_tag('character', 'z', 'z', $1)", [raiden])),
    ).rejects.toThrow(/상위 태그는 작품/);
  });

  it("주소에 쓸 수 없는 slug는 거부", async () => {
    for (const slug of ["Upper", "a b", "a/b", "a?b", ""]) {
      await expect(
        asUser(db, ADMIN, (tx) => tx.query("select public.create_official_tag('general', $1, 'n')", [slug])),
      ).rejects.toThrow(/tags_slug_check|violates check/);
    }
  });

  it("남의 글에는 태그를 붙일 수 없다", async () => {
    await expect(
      asUser(db, UPLOADER, (tx) => tx.query("insert into post_tags (post_id, tag_id) values ($1, $2)", [POST, genshin])),
    ).rejects.toThrow(/row-level security/);
    const ok = await asUser(db, UPLOADER, (tx) =>
      tx.query("insert into post_tags (post_id, tag_id) values ($1, $2) returning post_id", [UP_POST, genshin]),
    );
    expect(ok.rows).toHaveLength(1);
  });

  it("탐색 랭킹: 캐릭터 태그는 상위 작품으로 센다", async () => {
    const rows = await asUser(db, null, (tx) =>
      tx.query<{ name: string; recent_count: number }>("select name, recent_count::int from public.trending_works()"),
    );
    expect(rows.rows).toEqual([{ name: "원신", recent_count: 1 }]);
  });
});
