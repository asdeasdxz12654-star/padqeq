import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const UPLOADER = "00000000-0000-4000-8000-000000003701";
const VIEWER = "00000000-0000-4000-8000-000000003702";
const LEAVING = "00000000-0000-4000-8000-000000003703";

let db: PGlite;

beforeEach(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${UPLOADER}'), ('${VIEWER}'), ('${LEAVING}');
    insert into public.profiles (id, handle, display_name, can_upload) values
      ('${UPLOADER}', 'shooter1', '찍는 사람', true), ('${VIEWER}', 'viewer1', '보는 사람', false), ('${LEAVING}', 'leaving1', '떠나는 사람', true);
    update public.profiles set deletion_requested_at = now() where id = '${LEAVING}';
  `);
});

/** 오늘(한국)에서 며칠 뒤에 끝나는 행사 */
async function event(name: string, endsInDays: number, status = "official") {
  const tagId = (await db.query<{ id: string }>("insert into public.tags (kind, slug, name) values ('event', $1, $2) returning id", [name.replaceAll(" ", "-"), name])).rows[0]!.id;
  return (
    await db.query<{ id: string }>(
      `insert into public.events (name, starts_on, ends_on, venue, region, status, tag_id)
       values ($1, (now() at time zone 'Asia/Seoul')::date + $2::int - 1, (now() at time zone 'Asia/Seoul')::date + $2::int, '엑스코', '대구', $3, $4) returning id`,
      [name, endsInDays, status, status === "official" ? tagId : null],
    )
  ).rows[0]!.id;
}
const attend = (eventId: string, ...users: string[]) =>
  Promise.all(users.map((u) => db.query("insert into public.event_attendees (event_id, user_id) values ($1, $2)", [eventId, u])));
const send = async () => (await db.query<{ n: number }>("select private.send_event_photo_prompts() as n")).rows[0]!.n;
const prompts = async () => (await db.query("select recipient_id, event_id from notifications where kind = 'event_photos' order by recipient_id")).rows;

describe("행사 끝난 뒤 사진 올리기 알림", () => {
  it("어제 끝난 공식 행사의 참가 예정자 중 사진을 올릴 수 있는 회원에게만, 한 번만", async () => {
    const ended = await event("어제 끝난 행사", -1);
    const older = await event("그제 끝난 행사", -2);
    const ongoing = await event("오늘 끝나는 행사", 0);
    await attend(ended, UPLOADER, VIEWER, LEAVING);
    await attend(older, UPLOADER);
    await attend(ongoing, UPLOADER);

    expect(await send()).toBe(1);
    expect(await send()).toBe(0);
    expect(await prompts()).toEqual([{ recipient_id: UPLOADER, event_id: ended }]);
  });

  it("DB 관리자 연결만 부를 수 있다", async () => {
    await db.exec("set role authenticated");
    await expect(db.query("select private.send_event_photo_prompts()")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
