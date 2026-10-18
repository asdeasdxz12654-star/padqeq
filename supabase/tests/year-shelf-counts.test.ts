import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const AUTHOR = "00000000-0000-4000-8000-000000003901";
const PARTNER = "00000000-0000-4000-8000-000000003902";
const STRANGER = "00000000-0000-4000-8000-000000003903";
const P2026 = "f3900000-0000-4000-8000-000000000001";
const P2025 = "f3900000-0000-4000-8000-000000000002";
const DRAFT = "f3900000-0000-4000-8000-000000000003";
const EVENT_TAG = "f3910000-0000-4000-8000-000000000001";
const WORK_TAG = "f3910000-0000-4000-8000-000000000002";

let db: PGlite;

type Row = { shot_year: number; photos: string; events: string; partners: string };
const counts = (rows: Row[], year: number) => {
  const r = rows.find((x) => x.shot_year === year);
  return r ? { photos: Number(r.photos), events: Number(r.events), partners: Number(r.partners) } : null;
};
const SQL = `select * from public.author_year_counts('${AUTHOR}')`;
const shelf = async (viewer: string | null) =>
  viewer ? await asUser(db, viewer, async (tx) => (await tx.query<Row>(SQL)).rows) : (await db.query<Row>(SQL)).rows;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${AUTHOR}'), ('${PARTNER}'), ('${STRANGER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${AUTHOR}', 'author39', '작가', 'member', true),
      ('${PARTNER}', 'partner39', '모델', 'member', true),
      ('${STRANGER}', 'stranger39', '남', 'member', true);
    -- has_people = false: 촬영 동의 기록 없이 게시할 수 있게 (이 테스트의 관심사가 아니다)
    insert into public.posts (id, author_id, title, category, shot_year, has_people) values
      ('${P2026}', '${AUTHOR}', '올해', 'cosplay', 2026, false),
      ('${P2025}', '${AUTHOR}', '작년', 'cosplay', 2025, false),
      ('${DRAFT}', '${AUTHOR}', '아직 안 올린 글', 'cosplay', 2026, false);
    -- 2026년 글에 사진 3장, 2025년 글에 1장
    insert into public.photos (post_id, position, width, height, bytes) values
      ('${P2026}', 0, 100, 100, 1000), ('${P2026}', 1, 100, 100, 1000), ('${P2026}', 2, 100, 100, 1000),
      ('${P2025}', 0, 100, 100, 1000), ('${DRAFT}', 0, 100, 100, 1000);
    update public.posts set status = 'published' where id in ('${P2026}', '${P2025}');
    insert into public.tags (id, kind, name, slug, status) values
      ('${EVENT_TAG}', 'event', '대구콘페', 'daegu-confe', 'official'),
      ('${WORK_TAG}', 'work', '원신', 'genshin', 'official');
    insert into public.post_tags (post_id, tag_id) values
      ('${P2026}', '${EVENT_TAG}'), ('${P2026}', '${WORK_TAG}');
  `);
});

describe("연도 책장 표지 숫자", () => {
  it("사진은 글이 아니라 장수로 센다", async () => {
    const rows = await shelf(AUTHOR);
    expect(counts(rows, 2026)?.photos).toBe(3);
    expect(counts(rows, 2025)?.photos).toBe(1);
  });

  it("게시하지 않은 글은 세지 않는다", async () => {
    // 2026년 사진 5장 중 DRAFT의 2장은 빠져 3장
    expect(counts(await shelf(AUTHOR), 2026)?.photos).toBe(3);
  });

  it("행사 태그만 행사로 센다 (작품 태그는 빼고)", async () => {
    const rows = await shelf(AUTHOR);
    expect(counts(rows, 2026)?.events).toBe(1);
    expect(counts(rows, 2025)?.events).toBe(0);
  });

  it("함께한 사람: 승인된 회원 크레딧과 미가입자 표기를 센다", async () => {
    await db.exec(`
      insert into public.credits (post_id, role, member_id, status) values
        ('${P2026}', 'model', '${PARTNER}', 'approved'),
        ('${P2026}', 'retoucher', '${STRANGER}', 'pending');
      insert into public.credits (post_id, role, external_label, status) values
        ('${P2026}', 'cosplayer', '하늘', 'external');
    `);
    // 승인된 모델 1 + 미가입자 1 = 2 (승인 안 된 크레딧은 빼고)
    expect(counts(await shelf(AUTHOR), 2026)?.partners).toBe(2);
  });

  it("같은 이름의 미가입자는 한 사람으로 센다", async () => {
    await db.exec(`
      insert into public.credits (post_id, role, external_label, status) values
        ('${P2026}', 'cosplayer', '하늘', 'external'),
        ('${P2026}', 'model', '하늘', 'external');
    `);
    expect(counts(await shelf(AUTHOR), 2026)?.partners).toBe(1);
  });

  it("작가 본인은 함께한 사람에 들어가지 않는다", async () => {
    await db.exec(`
      insert into public.credits (post_id, role, member_id, status) values ('${P2026}', 'photographer', '${AUTHOR}', 'approved');
    `);
    expect(counts(await shelf(AUTHOR), 2026)?.partners).toBe(0);
  });

  it("로그인하지 않은 사람도 공개 프로필의 책장을 본다", async () => {
    const rows = await shelf(null);
    expect(counts(rows, 2026)?.photos).toBe(3);
  });

  it("촬영 연도가 최근 것부터 나온다", async () => {
    const rows = await shelf(STRANGER);
    expect(rows.map((r) => r.shot_year)).toEqual([2026, 2025]);
  });
});
