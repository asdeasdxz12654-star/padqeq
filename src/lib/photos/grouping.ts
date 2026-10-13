// 대량 업로드 자동 묶기 (A-02 ③).
//  · 촬영 시각 순으로 늘어놓고, 앞 사진과 30분 넘게 떨어지면 새 묶음
//  · 한 묶음(= 게시물 하나)은 최대 20장, 넘치면 이어서 새 묶음
//  · 촬영 시각이 없는 사진은 고른 순서대로 따로 묶는다

import { MAX_PHOTOS_PER_POST } from "./post-input";

export const GROUP_GAP_MINUTES = 30;

export type Groupable = { id: string; takenAt: string | null };

export function groupByShootingTime<T extends Groupable>(
  items: readonly T[],
  { gapMinutes = GROUP_GAP_MINUTES, maxPerGroup = MAX_PHOTOS_PER_POST } = {},
): T[][] {
  const dated = items
    .map((item, index) => ({ item, index, time: item.takenAt ? Date.parse(item.takenAt) : Number.NaN }))
    .filter((e) => Number.isFinite(e.time))
    // 같은 시각이면 고른 순서 유지
    .sort((a, b) => a.time - b.time || a.index - b.index);
  const undated = items.filter((item) => !item.takenAt || !Number.isFinite(Date.parse(item.takenAt)));

  const groups: T[][] = [];
  let current: T[] = [];
  let lastTime = Number.NaN;
  for (const { item, time } of dated) {
    const gap = (time - lastTime) / 60_000;
    if (current.length > 0 && (gap > gapMinutes || current.length >= maxPerGroup)) {
      groups.push(current);
      current = [];
    }
    current.push(item);
    lastTime = time;
  }
  if (current.length) groups.push(current);

  for (let i = 0; i < undated.length; i += maxPerGroup) groups.push(undated.slice(i, i + maxPerGroup));
  return groups;
}

/** 묶음의 촬영 시간대 (가장 이른 · 늦은 시각), 없으면 null */
export function timeRange(items: readonly Groupable[]): { start: string; end: string } | null {
  const times = items
    .map((i) => i.takenAt)
    .filter((t): t is string => t !== null && Number.isFinite(Date.parse(t)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return times.length ? { start: times[0]!, end: times.at(-1)! } : null;
}
