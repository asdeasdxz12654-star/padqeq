// 타임캡슐 여는 날: 오늘(한국)에서 N년 뒤 같은 날. 2월 29일은 평년이면 2월 28일.

export const CAPSULE_YEARS = [1, 2, 3, 5, 10] as const;
export type CapsuleYears = (typeof CAPSULE_YEARS)[number];

export function capsuleOpenOn(today: string, years: number): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const year = y + years;
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** 여는 날까지 남은 날 (오늘이면 0) */
export function daysUntil(today: string, openOn: string): number {
  return Math.round((Date.parse(openOn) - Date.parse(today)) / 86_400_000);
}
