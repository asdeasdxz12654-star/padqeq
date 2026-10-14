import { describe, expect, it } from "vitest";
import { dHash, hashDistance, PHASH_HEIGHT, PHASH_WIDTH } from "./phash";

/** 밝기 함수로 9×8 RGBA 그림 만들기 */
const image = (lum: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(PHASH_WIDTH * PHASH_HEIGHT * 4);
  for (let y = 0; y < PHASH_HEIGHT; y++) {
    for (let x = 0; x < PHASH_WIDTH; x++) {
      const v = lum(x, y);
      data.set([v, v, v, 255], (y * PHASH_WIDTH + x) * 4);
    }
  }
  return data;
};

describe("dHash", () => {
  it("왼쪽이 밝으면 1, 어두우면 0", () => {
    expect(dHash(image((x) => 255 - x * 20))).toBe("ffffffffffffffff");
    expect(dHash(image((x) => x * 20))).toBe("0000000000000000");
  });

  it("밝기 · 대비를 조금 바꿔도 지문은 같다", () => {
    const base = image((x, y) => (x * 37 + y * 53) % 200);
    const brighter = image((x, y) => Math.min(255, ((x * 37 + y * 53) % 200) * 1.1 + 10));
    expect(hashDistance(dHash(base), dHash(brighter))).toBeLessThanOrEqual(6);
  });

  it("다른 그림은 멀다", () => {
    const a = dHash(image((x, y) => (x * 37 + y * 53) % 200));
    const b = dHash(image((x, y) => (x * 91 + y * 17) % 230));
    expect(hashDistance(a, b)).toBeGreaterThan(6);
  });

  it("크기가 맞지 않으면 거부한다", () => {
    expect(() => dHash(new Uint8ClampedArray(10))).toThrow();
  });
});
