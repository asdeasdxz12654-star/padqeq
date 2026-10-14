// 행사 캘린더 (S-17 ④~⑦) · 캘린더 파일(.ics)

export const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원",
  "충북", "충남", "전북", "전남", "경북", "경남", "제주", "온라인", "해외",
] as const;
export type Region = (typeof REGIONS)[number];

export type Month = { year: number; month: number };

/** "2026-11" → { year, month }. 잘못된 값이면 fallback */
export function parseMonth(value: unknown, fallback: Month): Month {
  if (typeof value !== "string") return fallback;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return fallback;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return fallback;
  return { year, month };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const monthKey = ({ year, month }: Month) => `${year}-${pad(month)}`;
export const isoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 그 달의 첫날 · 마지막 날 (YYYY-MM-DD) */
export function monthRange({ year, month }: Month): { first: string; last: string } {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first: isoDate(year, month, 1), last: isoDate(year, month, days) };
}

/** 일요일 시작 달력. 앞뒤 빈칸은 null */
export function monthGrid({ year, month }: Month): (string | null)[][] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: days }, (_, i) => isoDate(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** 날짜(YYYY-MM-DD)가 행사 기간 안인지 */
export const onDay = (day: string, e: { starts_on: string; ends_on: string }) => e.starts_on <= day && day <= e.ends_on;

/** "11.21 – 22" · "11.30 – 12.1" · "11.21" */
export function formatRange(starts: string, ends: string): string {
  const [, sm, sd] = starts.split("-").map(Number);
  const [, em, ed] = ends.split("-").map(Number);
  if (starts === ends) return `${sm}.${sd}`;
  return sm === em ? `${sm}.${sd} – ${ed}` : `${sm}.${sd} – ${em}.${ed}`;
}

/** 행사 태그 주소: 이름 + 시작 연월 (태그 주소 규칙: 소문자 · 공백은 '-' · 일부 기호 없음 · 60자) */
export function eventTagSlug(name: string, startsOn: string): string {
  const base = name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s/?#%\\&+.]+/g, "-")
    .replace(/\p{Cc}/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = startsOn.slice(0, 7);
  return `${base.slice(0, 60 - suffix.length - 1)}-${suffix}`.replace(/^-/, "");
}

const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** 75바이트 줄 접기 (RFC 5545). 한글이 잘리지 않게 글자 단위로 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (encoder.encode(current + ch).length > limit) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n ");
}

const compact = (d: string) => d.replaceAll("-", "");
function nextDay(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export type IcsEvent = { id: string; name: string; starts_on: string; ends_on: string; venue: string; region: string; description: string };

/** 하루 종일 일정 하나짜리 캘린더 파일 */
export function eventIcs(e: IcsEvent, pageUrl: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//haedam//events//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@haedam`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(e.starts_on)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(e.ends_on))}`,
    `SUMMARY:${icsText(e.name)}`,
    `LOCATION:${icsText(`${e.venue} (${e.region})`)}`,
    `DESCRIPTION:${icsText(`${e.description ? `${e.description}\n\n` : ""}${pageUrl}`)}`,
    `URL:${pageUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
