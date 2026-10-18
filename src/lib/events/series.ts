// 해마다 같은 행사 (행사 시리즈): 이름에서 연도 · 회차를 빼면 같은 행사로 본다.
// 예: "2025 대구 코믹월드" · "대구 코믹월드 2026" · "제12회 대구 코믹월드" → "대구 코믹월드"

const YEAR = /(?:^|[\s(\[])(?:19|20)\d{2}(?:년)?(?=$|[\s)\]])/g;
const ROUND = /(?:제\s*)?\d+\s*회(?:차)?/g;

/** 같은 행사인지 견줄 때 쓰는 열쇠. 남는 글자가 2자보다 짧으면 null (묶지 않는다) */
export function seriesKey(name: string): string | null {
  const key = name
    .normalize("NFC")
    .toLowerCase()
    .replace(YEAR, " ")
    .replace(ROUND, " ")
    .replace(/[()[\]·:,\-–—|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key.length >= 2 ? key : null;
}

/** DB에서 후보를 찾는 ilike 무늬 (낱말 사이는 무엇이든). 특수 문자는 이스케이프 */
export function seriesPattern(key: string): string {
  return `%${key
    .split(" ")
    .map((w) => w.replace(/[\\%_]/g, (c) => `\\${c}`))
    .join("%")}%`;
}
