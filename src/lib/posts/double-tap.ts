// 사진을 두 번 톡 → 좋아요 (S-06 ②). 두 번째 탭이 가까운 시간 · 자리에 오면 두 번 탭으로 본다.

export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP = 30;

export type Tap = { time: number; x: number; y: number };

export function isDoubleTap(prev: Tap | null, next: Tap): boolean {
  if (!prev) return false;
  const gap = next.time - prev.time;
  return gap > 0 && gap <= DOUBLE_TAP_MS && Math.hypot(next.x - prev.x, next.y - prev.y) <= DOUBLE_TAP_SLOP;
}

/** 뷰어 → 좋아요 버튼 (같은 화면의 서로 다른 클라이언트 컴포넌트) */
export const DOUBLE_LIKE_EVENT = "haedam:double-like";
