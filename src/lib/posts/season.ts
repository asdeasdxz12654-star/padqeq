// 계절 모음: 촬영 날짜(shot_on)가 지금 계절에 든 사진 (해마다). 봄 3–5월 · 여름 6–8월 · 가을 9–11월 · 겨울 12–2월.

export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASON_LABEL: Record<Season, string> = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };

/** 그 달(1–12)의 계절 */
export function seasonOf(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

const START: Record<Season, number> = { spring: 3, summer: 6, autumn: 9, winter: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** 해마다 그 계절의 [시작, 끝) 날짜. 겨울은 그해 12월 1일부터 다음 해 3월 1일 전까지. */
export function seasonRanges(season: Season, years: number[]): { from: string; to: string }[] {
  const start = START[season];
  return [...new Set(years)]
    .toSorted((a, b) => b - a)
    .map((y) => {
      const endMonth = start + 3;
      const to = endMonth > 12 ? `${y + 1}-${pad(endMonth - 12)}-01` : `${y}-${pad(endMonth)}-01`;
      return { from: `${y}-${pad(start)}-01`, to };
    });
}
