import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ADMIN = "00000000-0000-4000-8000-00000000000a";
const MEMBER = "00000000-0000-4000-8000-00000000000b";
const OTHER = "00000000-0000-4000-8000-00000000000c";
const PUBLISHED = "10000000-0000-4000-8000-000000000001";
const DRAFT = "10000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  // 시드는 슈퍼유저로 넣는다 (RLS 우회). 게시 규칙 트리거는 그대로 동작한다.
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${MEMBER}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ADMIN}', 'haedam', '운영자', 'admin', true),
      ('${MEMBER}', 'moon_cos', '문', 'member', false),
      ('${OTHER}', 'photo_b', '비', 'member', false);

    insert into public.posts (id, author_id, title, category, shot_year) values
      ('${PUBLISHED}', '${ADMIN}', '야간 신사 촬영', 'cosplay', 2025),
      ('${DRAFT}', '${ADMIN}', '작업 중', 'landscape', 2026);
    insert into public.photos (post_id, position, storage_key, width, height, bytes)
      values ('${PUBLISHED}', 0, 'p/1', 4000, 2667, 3000000);
    insert into public.consent_records (post_id, subject_label, consented_on, created_by)
      values ('${PUBLISHED}', '코스어 문', '2025-05-01', '${ADMIN}');
    update public.posts set status = 'published' where id = '${PUBLISHED}';

    insert into public.credits (post_id, role, member_id, status) values
      ('${PUBLISHED}', 'cosplayer', '${MEMBER}', 'pending');
    insert into public.credits (post_id, role, external_label, status) values
      ('${PUBLISHED}', 'photographer', '@studio', 'external');
  `);
});

const count = (rows: { rows: unknown[] }) => rows.rows.length;

describe("게시물 공개 범위", () => {
  it("비로그인은 게시된 글만 본다", async () => {
    const rows = await asUser(db, null, (tx) => tx.query<{ id: string }>("select id from posts"));
    expect(rows.rows.map((r) => r.id)).toEqual([PUBLISHED]);
  });

  it("운영자는 초안도 본다", async () => {
    const rows = await asUser(db, ADMIN, (tx) => tx.query("select id from posts"));
    expect(count(rows)).toBe(2);
  });

  it("비로그인은 초안의 사진을 볼 수 없다", async () => {
    await db.exec(
      `insert into photos (post_id, position, storage_key, width, height, bytes) values ('${DRAFT}', 0, 'd/1', 1000, 800, 500000)`,
    );
    const rows = await asUser(db, null, (tx) => tx.query("select storage_key from photos"));
    expect(rows.rows).toEqual([{ storage_key: "p/1" }]);
  });

  it("연도 칩용 촬영 연도는 게시된 글만 센다", async () => {
    const rows = await asUser(db, null, (tx) => tx.query("select * from published_shot_years()"));
    expect(rows.rows).toEqual([{ year: 2025, post_count: 1 }]);
  });
});

describe("업로드 권한", () => {
  it("업로드 권한이 없는 회원은 글을 쓸 수 없다", async () => {
    await expect(
      asUser(db, MEMBER, (tx) =>
        tx.query(
          `insert into posts (author_id, title, category, shot_year) values ('${MEMBER}', 't', 'cosplay', 2026)`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("남의 이름으로 글을 쓸 수 없다", async () => {
    await expect(
      asUser(db, ADMIN, (tx) =>
        tx.query(
          `insert into posts (author_id, title, category, shot_year) values ('${MEMBER}', 't', 'cosplay', 2026)`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("회원은 자기 역할이나 업로드 권한을 바꿀 수 없다", async () => {
    await expect(
      asUser(db, MEMBER, (tx) => tx.query(`update profiles set role = 'admin' where id = '${MEMBER}'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, MEMBER, (tx) => tx.query(`update profiles set can_upload = true where id = '${MEMBER}'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("프로필을 직접 넣을 수 없다 (가입 함수만 사용)", async () => {
    const id = "00000000-0000-4000-8000-00000000000d";
    await db.exec(`insert into auth.users (id) values ('${id}')`);
    await expect(
      asUser(db, id, (tx) =>
        tx.query(`insert into profiles (id, handle, display_name, role) values ('${id}', 'newbie', 'n', 'admin')`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, id, (tx) =>
        tx.query(`insert into profiles (id, handle, display_name) values ('${id}', 'newbie', 'n')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("게시 규칙", () => {
  async function draftWithPhoto(tx: Parameters<Parameters<typeof asUser>[2]>[0], hasPeople: boolean) {
    const post = await tx.query<{ id: string }>(
      `insert into posts (author_id, title, category, shot_year, has_people)
       values ('${ADMIN}', '새 글', 'cosplay', 2026, $1) returning id`,
      [hasPeople],
    );
    const id = post.rows[0].id;
    await tx.query(
      `insert into photos (post_id, position, width, height, bytes) values ($1, 0, 3000, 2000, 2000000)`,
      [id],
    );
    return id;
  }

  it("촬영 동의 기록이 없으면 게시할 수 없다", async () => {
    await expect(
      asUser(db, ADMIN, async (tx) => {
        const id = await draftWithPhoto(tx, true);
        await tx.query("update posts set status = 'published' where id = $1", [id]);
      }),
    ).rejects.toThrow(/촬영 동의 기록/);
  });

  it("동의 기록이 있으면 게시되고 게시 시각이 남는다", async () => {
    const row = await asUser(db, ADMIN, async (tx) => {
      const id = await draftWithPhoto(tx, true);
      await tx.query(
        `insert into consent_records (post_id, subject_label, consented_on, created_by) values ($1, '모델', '2026-10-01', $2)`,
        [id, ADMIN],
      );
      return tx.query("update posts set status = 'published' where id = $1 returning published_at", [id]);
    });
    expect(row.rows[0]).toHaveProperty("published_at");
  });

  it("사람이 없는 풍경 사진은 동의 기록 없이 게시된다", async () => {
    const row = await asUser(db, ADMIN, async (tx) => {
      const id = await draftWithPhoto(tx, false);
      return tx.query("update posts set status = 'published' where id = $1 returning status", [id]);
    });
    expect(row.rows).toEqual([{ status: "published" }]);
  });

  it("사진이 없으면 게시할 수 없다", async () => {
    await expect(
      asUser(db, ADMIN, async (tx) => {
        const post = await tx.query<{ id: string }>(
          `insert into posts (author_id, title, category, shot_year, has_people)
           values ('${ADMIN}', '빈 글', 'landscape', 2026, false) returning id`,
        );
        await tx.query("update posts set status = 'published' where id = $1", [post.rows[0].id]);
      }),
    ).rejects.toThrow(/사진이 없는/);
  });

  it("노출 주의(sensitive)는 봉인되어 있다: 회원은 열 권한이 없고, DB 제약도 막는다", async () => {
    await expect(
      asUser(db, ADMIN, (tx) => tx.query(`update posts set sensitive = true where id = '${DRAFT}'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query(`update posts set sensitive = true where id = '${DRAFT}'`)).rejects.toThrow(/sensitive_sealed/);
  });

  it("미성년자가 있으면 보호자 동의가 필수다", async () => {
    await expect(
      asUser(db, ADMIN, (tx) =>
        tx.query(
          `insert into consent_records (post_id, subject_label, consented_on, created_by, has_minor)
           values ('${DRAFT}', '학생 코스어', '2026-10-01', '${ADMIN}', true)`,
        ),
      ),
    ).rejects.toThrow(/minor_needs_guardian/);
  });
});

describe("사진 파일 위치", () => {
  it("파일 위치는 DB가 무작위로 정한다", async () => {
    const rows = await asUser(db, ADMIN, (tx) =>
      tx.query<{ storage_key: string }>(
        `insert into photos (post_id, position, width, height, bytes) values ('${DRAFT}', 7, 1000, 800, 500000) returning storage_key`,
      ),
    );
    expect(rows.rows[0]?.storage_key).toMatch(/^p\/[0-9a-f]{32}$/);
  });

  it("회원이 파일 위치를 지정하거나 바꿀 수 없다 (남의 파일 끌어오기 방지)", async () => {
    await expect(
      asUser(db, ADMIN, (tx) =>
        tx.query(
          `insert into photos (post_id, position, storage_key, width, height, bytes) values ('${DRAFT}', 8, 'p/1', 1000, 800, 500000)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ADMIN, (tx) => tx.query(`update photos set storage_key = 'p/1' where post_id = '${DRAFT}'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("게시된 글에는 사진을 새로 붙일 수 없다", async () => {
    await expect(
      asUser(db, ADMIN, (tx) =>
        tx.query(
          `insert into photos (post_id, position, width, height, bytes) values ('${PUBLISHED}', 9, 1000, 800, 500000)`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("사진 크기 기준", () => {
  const insertPhoto = (w: number, h: number, bytes: number) =>
    asUser(db, ADMIN, (tx) =>
      tx.query(
        `insert into photos (post_id, position, width, height, bytes) values ('${DRAFT}', 5, $1, $2, $3) returning is_panorama`,
        [w, h, bytes],
      ),
    );

  it("일반 사진은 긴 변 4000px까지", async () => {
    await expect(insertPhoto(5000, 3333, 3_000_000)).rejects.toThrow(/photo_size_rules/);
  });

  it("8MB를 넘는 마스터는 거부", async () => {
    await expect(insertPhoto(4000, 3000, 9 * 1024 * 1024)).rejects.toThrow(/photo_size_rules/);
  });

  it("파노라마는 긴 변 16000px · 짧은 변 2000px까지 허용", async () => {
    const r = await insertPhoto(12000, 1800, 10 * 1024 * 1024);
    expect(r.rows).toEqual([{ is_panorama: true }]);
    await expect(insertPhoto(17000, 1800, 10 * 1024 * 1024)).rejects.toThrow(/photo_size_rules/);
  });
});

describe("크레딧", () => {
  it("승인 전 회원 크레딧은 남에게 보이지 않는다", async () => {
    const anon = await asUser(db, null, (tx) => tx.query("select status from credits"));
    expect(anon.rows).toEqual([{ status: "external" }]);
    const mine = await asUser(db, MEMBER, (tx) => tx.query("select status from credits order by status"));
    expect(count(mine)).toBe(2);
  });

  it("당사자는 승인할 수 있다", async () => {
    const r = await asUser(db, MEMBER, (tx) =>
      tx.query(`update credits set status = 'approved' where member_id = '${MEMBER}' returning status`),
    );
    expect(r.rows).toEqual([{ status: "approved" }]);
  });

  it("작성자는 남의 크레딧을 대신 승인할 수 없다", async () => {
    const r = await asUser(db, ADMIN, (tx) =>
      tx.query(`update credits set status = 'approved' where member_id = '${MEMBER}' returning id`),
    );
    expect(count(r)).toBe(0);
  });

  it("다른 회원은 남의 크레딧을 승인할 수 없다", async () => {
    const r = await asUser(db, OTHER, (tx) =>
      tx.query(`update credits set status = 'approved' where member_id = '${MEMBER}' returning id`),
    );
    expect(count(r)).toBe(0);
  });
});

describe("비공개 기록", () => {
  it("촬영 동의 기록은 비로그인에게 권한 자체가 없다", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select * from consent_records"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("회원은 촬영 동의 기록을 볼 수 없고 운영자만 본다", async () => {
    const member = await asUser(db, MEMBER, (tx) => tx.query("select * from consent_records"));
    expect(count(member)).toBe(0);
    const admin = await asUser(db, ADMIN, (tx) => tx.query("select * from consent_records"));
    expect(count(admin)).toBe(1);
  });

  it("감사 로그는 API 역할로 접근할 수 없다", async () => {
    await expect(asUser(db, ADMIN, (tx) => tx.query("select * from private.audit_log"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("게시 상태 변경은 감사 로그에 남는다", async () => {
    const r = await db.query("select action, detail from private.audit_log");
    expect(r.rows).toContainEqual({ action: "post_status", detail: { from: "draft", to: "published" } });
  });
});

describe("신고", () => {
  it("회원은 신고할 수 있지만 남의 신고는 볼 수 없다", async () => {
    await db.exec(
      `insert into reports (reporter_id, post_id, reason) values ('${OTHER}', '${PUBLISHED}', 'portrait_rights')`,
    );
    const member = await asUser(db, MEMBER, (tx) => tx.query("select * from reports"));
    expect(count(member)).toBe(0);
    const admin = await asUser(db, ADMIN, (tx) => tx.query("select * from reports"));
    expect(count(admin)).toBe(1);
  });

  it("남의 이름으로 신고할 수 없다", async () => {
    await expect(
      asUser(db, MEMBER, (tx) =>
        tx.query(`insert into reports (reporter_id, post_id, reason) values ('${OTHER}', '${PUBLISHED}', 'spam')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("게시 함수 (동의 기록 + 게시를 한 번에)", () => {
  const draft = async (tx: Parameters<Parameters<typeof asUser>[2]>[0], hasPeople: boolean) => {
    const post = await tx.query<{ id: string }>(
      `insert into posts (author_id, title, category, shot_year, has_people) values ('${ADMIN}', '게시 함수', 'cosplay', 2026, $1) returning id`,
      [hasPeople],
    );
    const id = post.rows[0]!.id;
    await tx.query(`insert into photos (post_id, position, width, height, bytes) values ($1, 0, 3000, 2000, 2000000)`, [id]);
    return id;
  };

  it("동의 기록과 함께 게시된다", async () => {
    const result = await asUser(db, ADMIN, async (tx) => {
      const id = await draft(tx, true);
      await tx.query("select public.publish_my_post($1, '코스어 문', date '2026-09-14')", [id]);
      const post = await tx.query<{ status: string }>("select status::text from posts where id = $1", [id]);
      const consent = await tx.query("select 1 from consent_records where post_id = $1", [id]);
      return { status: post.rows[0]?.status, consents: consent.rows.length };
    });
    expect(result).toEqual({ status: "published", consents: 1 });
  });

  it("게시가 막히면 동의 기록도 남지 않는다", async () => {
    // 사진 없는 글: 동의 기록은 들어가지만 게시 규칙에 걸려 전체가 되돌려져야 한다
    const leftovers = await asUser(db, ADMIN, async (tx) => {
      const post = await tx.query<{ id: string }>(
        `insert into posts (author_id, title, category, shot_year) values ('${ADMIN}', '사진 없음', 'cosplay', 2026) returning id`,
      );
      const id = post.rows[0]!.id;
      await tx.query("savepoint s");
      await expect(tx.query("select public.publish_my_post($1, '누군가', date '2026-09-14')", [id])).rejects.toThrow(
        /사진이 없는/,
      );
      await tx.query("rollback to savepoint s");
      return (await tx.query("select 1 from consent_records where post_id = $1", [id])).rows.length;
    });
    expect(leftovers).toBe(0);
  });

  it("남의 글은 게시할 수 없다", async () => {
    await expect(asUser(db, MEMBER, (tx) => tx.query("select public.publish_my_post($1)", [DRAFT]))).rejects.toThrow(
      /post_not_publishable/,
    );
  });

  it("비로그인은 부를 수 없다", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select public.publish_my_post($1)", [DRAFT]))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("워터마크 열쇠", () => {
  const SEED_A = "00112233445566778899aabbccddeeff";

  const draftWithPhoto = async (tx: Parameters<Parameters<typeof asUser>[2]>[0]) => {
    const post = await tx.query<{ id: string }>(
      `insert into posts (author_id, title, category, shot_year, has_people) values ('${ADMIN}', '워터마크', 'landscape', 2026, false) returning id`,
    );
    const postId = post.rows[0]!.id;
    const photo = await tx.query<{ id: string }>(
      `insert into photos (post_id, position, width, height, bytes) values ($1, 0, 3000, 2000, 2000000) returning id`,
      [postId],
    );
    return { postId, photoId: photo.rows[0]!.id };
  };

  it("작성자가 초안에 넣고, 운영자만 꺼낸다", async () => {
    const seeds = await asUser(db, ADMIN, async (tx) => {
      const { postId, photoId } = await draftWithPhoto(tx);
      await tx.query("select public.set_photo_watermarks($1, $2)", [postId, JSON.stringify([{ photo_id: photoId, seed: SEED_A }])]);
      return (await tx.query<{ seed: string }>("select seed from public.photo_watermark_seeds($1)", [postId])).rows;
    });
    expect(seeds).toEqual([{ seed: SEED_A }]);
  });

  it("운영자가 아니면 열쇠를 꺼낼 수 없다 (빈 결과)", async () => {
    const rows = await asUser(db, MEMBER, (tx) => tx.query("select * from public.photo_watermark_seeds($1)", [PUBLISHED]));
    expect(rows.rows).toEqual([]);
  });

  it("남의 글 · 다른 글의 사진 · 잘못된 열쇠는 거부", async () => {
    await expect(
      asUser(db, MEMBER, (tx) => tx.query("select public.set_photo_watermarks($1, '[]')", [DRAFT])),
    ).rejects.toThrow(/post_not_editable/);
    await expect(
      asUser(db, ADMIN, async (tx) => {
        const { postId } = await draftWithPhoto(tx);
        const other = await tx.query<{ id: string }>("select id from photos where post_id = $1", [PUBLISHED]);
        await tx.query("select public.set_photo_watermarks($1, $2)", [
          postId,
          JSON.stringify([{ photo_id: other.rows[0]!.id, seed: SEED_A }]),
        ]);
      }),
    ).rejects.toThrow(/photo_not_in_post/);
    await expect(
      asUser(db, ADMIN, async (tx) => {
        const { postId, photoId } = await draftWithPhoto(tx);
        await tx.query("select public.set_photo_watermarks($1, $2)", [postId, JSON.stringify([{ photo_id: photoId, seed: "zz" }])]);
      }),
    ).rejects.toThrow(/seed_invalid/);
  });

  it("열쇠 테이블은 API 역할로 직접 읽을 수 없다", async () => {
    await expect(asUser(db, ADMIN, (tx) => tx.query("select * from private.photo_watermarks"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("크레딧 저장 흐름", () => {
  it("작성자가 나 자신을 크레딧하면 요청 후 스스로 승인할 수 있다", async () => {
    const status = await asUser(db, ADMIN, async (tx) => {
      const c = await tx.query<{ id: string }>(
        `insert into credits (post_id, role, member_id, status) values ('${DRAFT}', 'photographer', '${ADMIN}', 'pending') returning id`,
      );
      await tx.query("update credits set status = 'approved' where id = $1", [c.rows[0]!.id]);
      return (await tx.query<{ status: string }>("select status::text from credits where id = $1", [c.rows[0]!.id])).rows[0]?.status;
    });
    expect(status).toBe("approved");
  });

  it("작성자는 남의 크레딧을 승인 상태로 바로 넣을 수 없다", async () => {
    await expect(
      asUser(db, ADMIN, (tx) =>
        tx.query(`insert into credits (post_id, role, member_id, status) values ('${DRAFT}', 'model', '${MEMBER}', 'approved')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("미가입자 링크는 https만", async () => {
    await expect(
      asUser(db, ADMIN, (tx) =>
        tx.query(
          `insert into credits (post_id, role, external_label, external_url, status) values ('${DRAFT}', 'cosplayer', '달빛', 'javascript:alert(1)', 'external')`,
        ),
      ),
    ).rejects.toThrow(/credits_external_url_check/);
  });
});
