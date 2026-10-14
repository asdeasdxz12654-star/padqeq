import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const UPLOADER = "00000000-0000-4000-8000-000000002101";
const MODEL = "00000000-0000-4000-8000-000000002102";
const OTHER = "00000000-0000-4000-8000-000000002103";
const POST = "f7000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${UPLOADER}'), ('${MODEL}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, can_upload) values
      ('${UPLOADER}', 'uploader1', '업로더', true), ('${MODEL}', 'model1', '모델', false), ('${OTHER}', 'other1', '남', false);
  `);
});

async function as<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query<T>(sql, params);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

/** 업로더의 새 글 (사진 1장 · 게시) */
async function newPost(id: string) {
  await db.exec(`
    insert into posts (id, author_id, title, category, shot_year, has_people) values ('${id}', '${UPLOADER}', '글', 'model', 2026, false);
    insert into photos (post_id, position, width, height, bytes) values ('${id}', 0, 100, 100, 1000);
    update posts set status = 'published' where id = '${id}';
  `);
}

const request = (post: string, member = MODEL) =>
  as(UPLOADER, "insert into credits (post_id, role, member_id, status) values ($1, 'model', $2, 'pending')", [post, member]);

describe("크레딧 요청 제한", () => {
  beforeEach(() => newPost(POST));

  it("같은 글에 같은 회원 · 같은 역할은 한 번만 (역할이 다르면 된다)", async () => {
    await request(POST);
    await expect(request(POST)).rejects.toThrow(/credit_duplicate/);
    await as(UPLOADER, "insert into credits (post_id, role, member_id, status) values ($1, 'retoucher', $2, 'pending')", [POST, MODEL]);
  });

  it("거절하거나 스스로 뺀 회원에게는 같은 글로 다시 요청할 수 없다", async () => {
    await request(POST);
    await as(MODEL, "update credits set status = 'rejected' where member_id = auth.uid()");
    await as(UPLOADER, "delete from credits where post_id = $1", [POST]);
    await expect(request(POST)).rejects.toThrow(/credit_declined_before/);

    await request(POST, OTHER);
    await as(OTHER, "delete from credits where member_id = auth.uid()");
    await expect(request(POST, OTHER)).rejects.toThrow(/credit_declined_before/);
  });

  it("글쓴이가 지운 요청은 다시 할 수 있다", async () => {
    await request(POST);
    await as(UPLOADER, "delete from credits where post_id = $1", [POST]);
    await request(POST);
  });

  it("차단한 사이에는 요청할 수 없다", async () => {
    await db.exec(`insert into blocks (blocker_id, blocked_id) values ('${MODEL}', '${UPLOADER}')`);
    await expect(request(POST)).rejects.toThrow(/credit_blocked/);
  });

  it("한 회원에게 대기 중인 요청은 20개까지", async () => {
    for (let i = 0; i < 20; i++) {
      const id = `f7000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`;
      await newPost(id);
      await request(id);
    }
    await expect(request(POST)).rejects.toThrow(/credit_pending_limit/);
  });

  it("나 자신 · 미가입자 표기는 제한하지 않는다", async () => {
    await as(UPLOADER, "insert into credits (post_id, role, member_id, status) values ($1, 'photographer', auth.uid(), 'pending')", [POST]);
    await as(UPLOADER, "insert into credits (post_id, role, external_label, status) values ($1, 'model', '미가입 모델', 'external'), ($1, 'model', '미가입 모델', 'external')", [POST]);
  });
});
