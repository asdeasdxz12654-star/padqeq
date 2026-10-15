// 최근 검색어 (S-04 ①): 이 기기에만 저장한다. 서버로 보내지 않는다.

export const RECENT_KEY = "haedam:recent-searches";
export const MAX_RECENT = 8;

/** 새 검색어를 맨 앞에 (같은 말은 하나만, 대소문자 무시) */
export function addRecent(list: readonly string[], query: string): string[] {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 50);
  if (!q) return [...list];
  return [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
}

export function removeRecent(list: readonly string[], query: string): string[] {
  return list.filter((x) => x !== query);
}

/** 저장된 값이 깨져 있어도 빈 목록으로 (사생활 보호 모드 · 저장 막힘 포함) */
export function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function writeRecent(list: readonly string[]): void {
  try {
    if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENT_KEY);
  } catch {
    // 저장할 수 없으면 이번에만 쓴다
  }
}
