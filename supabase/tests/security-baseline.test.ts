import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

// 출시 전 점검: 마이그레이션이 늘어도 권한이 몰래 열리지 않도록 DB 전체의 기준을 고정한다.
// 새 테이블 · 함수를 공개하려면 여기 목록도 함께 고쳐야 한다 (의도한 공개인지 리뷰에서 보이게).

const ME = "00000000-0000-4000-8000-000000003401";
const OTHER = "00000000-0000-4000-8000-000000003402";

// 비로그인도 읽는 테이블 (각각 RLS로 행을 거른다)
const ANON_READABLE = [
  "board_posts",
  "board_replies",
  "collection_posts",
  "collections",
  "comments",
  "creator_profiles",
  "credits",
  "daily_picks",
  "event_attendees",
  "events",
  "notices",
  "photos",
  "place_guides",
  "post_tags",
  "posts",
  "profiles",
  "site_switches",
  "tag_aliases",
  "tag_slug_redirects",
  "tags",
];

// 비로그인도 부르는 함수. 푸시 두 개는 서버 비밀 토큰을 확인한다.
const ANON_CALLABLE = [
  "claim_push_batch",
  "creator_directory",
  "drop_push_subscriptions",
  "event_attendee_counts",
  "on_this_day",
  "place_map",
  "popular_posts",
  "post_like_stats",
  "published_shot_years",
  "recommended_posts",
  "related_tags",
  "tag_cosers",
  "tag_popular_posts",
  "tone_posts",
  "trending_works",
];

let db: PGlite;
const rows = async <T>(sql: string) => (await db.query<T>(sql)).rows;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, interest_categories, show_veiled) values
      ('${ME}', 'me_1', '나', '{cosplay,landscape}', true),
      ('${OTHER}', 'other_1', '남', '{}', false);
  `);
});

describe("DB 보안 기준", () => {
  it("public의 모든 테이블에 RLS가 켜져 있다", async () => {
    expect(
      await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`),
    ).toEqual([]);
  });

  it("비로그인은 정해진 테이블을 읽기만 한다", async () => {
    // 테이블 단위 · 열 단위 권한을 모두 본다 (profiles는 열 단위로 공개)
    const writes = await rows(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public' and privilege_type <> 'SELECT'
       union all
       select table_name, privilege_type from information_schema.column_privileges
       where grantee = 'anon' and table_schema = 'public' and privilege_type <> 'SELECT'`,
    );
    expect(writes).toEqual([]);
    const readable = await rows<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and has_any_column_privilege('anon', c.oid, 'SELECT') order by 1`,
    );
    expect(readable.map((r) => r.relname)).toEqual(ANON_READABLE);
  });

  it("비로그인이 부를 수 있는 함수는 정해진 것뿐", async () => {
    const callable = await rows<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    );
    expect(callable.map((r) => r.proname)).toEqual(ANON_CALLABLE);
  });

  it("SECURITY DEFINER 함수는 모두 search_path를 비워 둔다", async () => {
    expect(
      await rows(`select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname in ('public', 'private') and p.prosecdef
                    and not (coalesce(p.proconfig, '{}') @> array['search_path=""'])`),
    ).toEqual([]);
  });

  it("푸시 함수는 토큰 없이 아무것도 내주지 않는다", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select * from claim_push_batch('x')"))).rejects.toThrow();
    await expect(asUser(db, null, (tx) => tx.query("select drop_push_subscriptions(repeat('a', 40), '{}')"))).rejects.toThrow();
  });
});

describe("본인 설정 읽기", () => {
  it("로그인한 본인 것만 돌려준다", async () => {
    const mine = await asUser(db, ME, (tx) => tx.query("select interest_categories, show_veiled, memory_alerts, credit_auto_approve, upload_revoked_at from my_settings()"));
    expect(mine.rows).toEqual([
      { interest_categories: "{cosplay,landscape}", show_veiled: true, memory_alerts: true, credit_auto_approve: false, upload_revoked_at: null },
    ]);
    await expect(asUser(db, null, (tx) => tx.query("select * from my_settings()"))).rejects.toThrow(/permission denied/);
  });
});

describe("프로필 개인 설정 열", () => {
  it("남은 물론 본인도 직접 읽지 못하고, 공개 열은 그대로 읽는다", async () => {
    for (const user of [null, ME, OTHER]) {
      for (const column of ["interest_categories", "show_veiled", "memory_alerts", "credit_auto_approve", "upload_revoked_at"]) {
        await expect(asUser(db, user, (tx) => tx.query(`select ${column} from profiles`))).rejects.toThrow(/permission denied/);
      }
      await expect(asUser(db, user, (tx) => tx.query("select * from profiles"))).rejects.toThrow(/permission denied/);
      const visible = await asUser(db, user, (tx) => tx.query("select handle, display_name, role from profiles order by handle"));
      expect(visible.rows).toHaveLength(2);
    }
  });

  it("본인 설정은 여전히 고칠 수 있다", async () => {
    await asUser(db, ME, async (tx) => {
      await tx.query(`update profiles set show_veiled = false, interest_categories = '{landscape}' where id = '${ME}'`);
      expect((await tx.query("select show_veiled, interest_categories from my_settings()")).rows).toEqual([{ show_veiled: false, interest_categories: "{landscape}" }]);
      // 남의 설정은 바뀌지 않는다 (RLS)
      expect((await tx.query(`update profiles set show_veiled = true where id = '${OTHER}'`)).affectedRows).toBe(0);
    });
  });
});
