import { CATEGORIES } from "@/lib/photos/post-input";

// 피드 · 탐색 주소의 검색 조건 (?q= · ?category=). 잘못된 값은 조건 없음으로 본다.

export type Category = (typeof CATEGORIES)[number];

export const MAX_QUERY_LENGTH = 50;

export function parseCategory(value: string | string[] | undefined): Category | null {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : null;
}

export type SearchQuery = { kind: "title"; text: string } | { kind: "handle"; text: string };

/** "@moon" → 핸들 검색, 그 밖에는 제목 검색. 앞뒤 공백 · 연속 공백 정리, 길이 제한 */
export function parseQuery(value: string | string[] | undefined): SearchQuery | null {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFC").replace(/\p{Cc}/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  if (text.startsWith("@")) {
    const handle = text.slice(1).toLowerCase();
    return /^[a-z0-9_]{1,20}$/.test(handle) ? { kind: "handle", text: handle } : null;
  }
  return text.length > 0 ? { kind: "title", text } : null;
}

/** LIKE 패턴의 특수 문자(% _ \)를 글자 그대로 찾도록 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 조건을 유지한 채 다른 조건만 바꾼 주소 */
export function feedHref(
  path: "/" | "/explore",
  current: { year: number | null; category: Category | null; q: string | null },
  patch: Partial<{ year: number | null; category: Category | null; q: string | null }>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.category) params.set("category", next.category);
  if (next.year !== null) params.set("year", String(next.year));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
