import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./harness";

const ME = "00000000-0000-4000-8000-000000004101";
const OTHER = "00000000-0000-4000-8000-000000004102";
const HASH = "0123456789abcdef0123456789abcdef";

let db: PGlite;

const myKey = (owner = ME, hash = HASH) => `avatars/${owner}/${hash}.avif`;

/** asUser는 끝나면 되돌리므로, 바꾸기와 확인을 같은 트랜잭션 안에서 한다 */
const setThenRead = (user: string | null, key: string | null, readOf = ME) =>
  asUser(db, user, async (tx) => {
    await tx.query("select public.set_my_avatar($1)", [key]);
    const { rows } = await tx.query<{ avatar_key: string | null }>("select avatar_key from public.profiles where id = $1", [readOf]);
    return rows[0]!.avatar_key;
  });

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${ME}'), ('${OTHER}');
    insert into public.profiles (id, handle, display_name, role, can_upload) values
      ('${ME}', 'me41', '나', 'member', true), ('${OTHER}', 'other41', '남', 'member', true);
  `);
});

describe("프로필 사진", () => {
  it("올리지 않으면 비어 있다", async () => {
    const { rows } = await db.query<{ avatar_key: string | null }>("select avatar_key from public.profiles where id = $1", [ME]);
    expect(rows[0]!.avatar_key).toBeNull();
  });

  it("내 폴더의 열쇠는 적힌다", async () => {
    expect(await setThenRead(ME, myKey())).toBe(myKey());
  });

  it("null을 주면 내린다", async () => {
    const after = await asUser(db, ME, async (tx) => {
      await tx.query("select public.set_my_avatar($1)", [myKey()]);
      await tx.query("select public.set_my_avatar($1)", [null]);
      const { rows } = await tx.query<{ avatar_key: string | null }>("select avatar_key from public.profiles where id = $1", [ME]);
      return rows[0]!.avatar_key;
    });
    expect(after).toBeNull();
  });

  it("남의 폴더를 가리키는 열쇠는 거절한다", async () => {
    await expect(setThenRead(ME, myKey(OTHER))).rejects.toThrow(/avatar_key_not_mine/);
  });

  it("형식이 다른 열쇠는 거절한다", async () => {
    for (const bad of [`avatars/${ME}/../../secret.avif`, `photos/${ME}/${HASH}.avif`, `avatars/${ME}/${HASH}.png`]) {
      await expect(setThenRead(ME, bad)).rejects.toThrow();
    }
  });

  it("내 것만 바뀐다 (남의 프로필은 그대로)", async () => {
    expect(await setThenRead(ME, myKey(), OTHER)).toBeNull();
  });

  it("비로그인은 부를 수 없다", async () => {
    await expect(setThenRead(null, myKey())).rejects.toThrow();
  });
});
