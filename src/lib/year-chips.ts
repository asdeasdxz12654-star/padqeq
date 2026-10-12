// 연도 칩 규칙 (화면 기획서 S-02 · P-04)
// - 기준은 촬영 연도
// - 올해 칩은 사진이 없어도 항상 있다 → 한국 시간 1월 1일 0시에 새 칩이 생긴다
// - 칩은 최근 4개까지, 나머지는 "이전 ▾"으로 묶는다
// - 선택한 연도는 주소의 ?year= 로 공유된다

export const MIN_YEAR = 1990;
export const VISIBLE_CHIPS = 4;

const kstYear = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" });

export function currentYearKst(now: Date = new Date()): number {
  return Number(kstYear.format(now));
}

export type YearChips = {
  /** 칩으로 바로 보이는 연도 (최신순) */
  visible: number[];
  /** "이전 ▾" 메뉴에 들어가는 연도 (최신순) */
  older: number[];
};

export function buildYearChips(yearsWithPosts: readonly number[], now: Date = new Date()): YearChips {
  const thisYear = currentYearKst(now);
  const years = [...new Set([thisYear, ...yearsWithPosts])]
    .filter((y) => Number.isInteger(y) && y >= MIN_YEAR && y <= thisYear)
    .sort((a, b) => b - a);
  return { visible: years.slice(0, VISIBLE_CHIPS), older: years.slice(VISIBLE_CHIPS) };
}

/** ?year= 값을 검증한다. 잘못된 값이면 null(= 전체). */
export function parseYearParam(value: string | string[] | undefined, now: Date = new Date()): number | null {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= MIN_YEAR && year <= currentYearKst(now) ? year : null;
}
