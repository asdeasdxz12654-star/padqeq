// 하루의 빛 (해담다움 10번): 촬영 시각의 해 높이로 골든아워 · 블루아워 · 낮 · 밤을 나눈다.
// 위치(GPS)는 읽지 않으므로 한국 한가운데를 기준으로 한다. 시각대가 한국(+09:00)이 아닌 사진은 나누지 않는다.

export type DayLight = "golden" | "blue" | "day" | "night";

export const DAY_LIGHT_LABEL: Record<DayLight, string> = { golden: "골든아워", blue: "블루아워", day: "한낮", night: "밤" };

const KOREA = { lat: 36.5, lng: 127.8 };
const rad = Math.PI / 180;

/** 그 순간 한국 한가운데에서 본 해의 높이 (도). 간이 천문 계산이라 오차는 1도 안쪽 */
export function sunElevation(at: Date, { lat, lng } = KOREA): number {
  const n = at.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545;
  const mean = (280.46 + 0.9856474 * n) % 360;
  const anomaly = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (mean + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * rad;
  const tilt = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(tilt) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(tilt) * Math.sin(lambda));
  const sidereal = (((18.697374558 + 24.06570982441908 * n) % 24) * 15 + lng) * rad;
  const hour = sidereal - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(hour)) / rad;
}

/** 해 높이 → 빛. 골든아워 -4° ~ 6°, 블루아워 -6° ~ -4° */
export function dayLight(at: Date): DayLight {
  const e = sunElevation(at);
  return e >= 6 ? "day" : e >= -4 ? "golden" : e >= -6 ? "blue" : "night";
}

/**
 * EXIF 촬영 시각(카메라 시계의 벽시계 시각)으로 빛을 정한다. exifr는 벽시계 시각을 브라우저 시간대로 읽으므로
 * 그 칸들을 그대로 꺼내 시각대(OffsetTimeOriginal, 없으면 한국)로 되돌린다. 한국 밖 시각대면 null.
 */
export function dayLightFromExif(taken: unknown, offset: unknown): DayLight | null {
  if (!(taken instanceof Date) || Number.isNaN(taken.getTime())) return null;
  if (offset !== undefined && offset !== null && offset !== "+09:00") return null;
  const utc = Date.UTC(taken.getFullYear(), taken.getMonth(), taken.getDate(), taken.getHours() - 9, taken.getMinutes(), taken.getSeconds());
  return dayLight(new Date(utc));
}
