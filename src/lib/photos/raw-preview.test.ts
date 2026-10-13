import { describe, expect, it } from "vitest";
import { findLargestEmbeddedJpeg, orientedSize } from "./raw-preview";

/** 최소 JPEG: SOI · SOF0(크기) · SOS · 압축 데이터 · EOI */
function jpeg(width: number, height: number, payload: number[] = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd3, 0x56]): number[] {
  return [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0,
    ...payload,
    0xff, 0xd9,
  ];
}

const noise = (n: number) => Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xfe);

describe("RAW 안 미리보기 JPEG", () => {
  it("가장 큰 JPEG를 골라 정확히 잘라 낸다", () => {
    const small = jpeg(160, 120);
    const large = jpeg(6000, 4000);
    const bytes = new Uint8Array([...noise(300), ...small, ...noise(500), ...large, ...noise(200)]);
    const found = findLargestEmbeddedJpeg(bytes.buffer);
    expect(found).toMatchObject({ width: 6000, height: 4000, offset: 300 + small.length + 500, length: large.length });
  });

  it("압축 데이터 안의 FF00 · RST 마커에서 끊기지 않는다", () => {
    const bytes = new Uint8Array([...noise(10), ...jpeg(2560, 1707, [1, 0xff, 0x00, 2, 0xff, 0xd0, 3, 0xff, 0xd7, 4])]);
    expect(findLargestEmbeddedJpeg(bytes.buffer)).toMatchObject({ width: 2560, height: 1707 });
  });

  it("끝이 잘린 JPEG · JPEG가 없는 파일은 null", () => {
    const broken = jpeg(800, 600).slice(0, -2);
    expect(findLargestEmbeddedJpeg(new Uint8Array([...noise(50), ...broken]).buffer)).toBeNull();
    expect(findLargestEmbeddedJpeg(new Uint8Array(noise(1000)).buffer)).toBeNull();
  });

  it("세로 방향(5~8)이면 가로 · 세로를 바꾼다", () => {
    expect(orientedSize(6000, 4000, 6)).toEqual({ width: 4000, height: 6000 });
    expect(orientedSize(6000, 4000, 1)).toEqual({ width: 6000, height: 4000 });
  });
});
