// 사진 지문 (dHash, 64비트). 크기 · 화질 · 약한 보정이 달라도 같은 사진이면 가까운 값이 나온다.
// 9×8 회색조로 줄인 뒤 가로로 이웃한 두 칸의 밝기를 비교해 비트를 만든다.
// DB(photo_hashes 마이그레이션)는 해밍 거리 6 이하를 "같은 사진"으로 본다.

export const PHASH_WIDTH = 9;
export const PHASH_HEIGHT = 8;

/** 9×8 RGBA 픽셀 → 16자리 16진수 지문 */
export function dHash(rgba: Uint8ClampedArray | Uint8Array): string {
  if (rgba.length !== PHASH_WIDTH * PHASH_HEIGHT * 4) throw new Error("지문용 그림 크기가 맞지 않아요");
  const gray = new Float64Array(PHASH_WIDTH * PHASH_HEIGHT);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
  }
  let bits = 0n;
  for (let y = 0; y < PHASH_HEIGHT; y++) {
    for (let x = 0; x < PHASH_WIDTH - 1; x++) {
      bits = (bits << 1n) | (gray[y * PHASH_WIDTH + x]! > gray[y * PHASH_WIDTH + x + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

/** 두 지문의 해밍 거리 (다른 비트 수) */
export function hashDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}
