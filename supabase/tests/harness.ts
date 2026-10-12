// Docker 없이 마이그레이션과 RLS를 검증하기 위한 테스트 DB.
// PGlite(WASM PostgreSQL)에 Supabase의 역할(anon · authenticated)과 auth 스키마를
// 최소한으로 흉내 낸 뒤, 실제 마이그레이션 파일을 그대로 실행한다.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const SUPABASE_STUB = `
  create schema extensions;
  create schema auth;
  create role anon nologin;
  create role authenticated nologin;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth, public, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase는 public의 새 테이블에 anon · authenticated 전체 권한을 기본으로 준다.
  -- 마이그레이션이 이를 제대로 걷어내는지 확인하려고 똑같이 재현한다.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { citext } });
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

/** 지정한 사용자(null이면 비로그인)로 실행하고, 끝나면 항상 되돌린다. */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  let result!: T;
  let failure: unknown;
  await db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    if (userId) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    try {
      result = await run(tx);
    } catch (error) {
      failure = error;
    }
    await tx.rollback();
  });
  if (failure) throw failure;
  return result;
}
