import { describe, expect, it } from "vitest";
import { isPanorama, objectKey, storageToken, variantMaxBytes, variantSize } from "./variants";

describe("변환본 크기", () => {
  it("일반 사진은 긴 변을 맞춘다", () => {
    expect(variantSize(6000, 4000, "4000")).toEqual({ width: 4000, height: 2667 });
    expect(variantSize(4000, 6000, "1200")).toEqual({ width: 800, height: 1200 });
    expect(variantSize(6000, 4000, "1600")).toEqual({ width: 1600, height: 1067 });
  });

  it("작은 사진은 키우지 않는다", () => {
    expect(variantSize(1000, 800, "4000")).toEqual({ width: 1000, height: 800 });
    expect(variantSize(1000, 800, "2560")).toEqual({ width: 1000, height: 800 });
  });

  it("파노라마는 짧은 변 기준 + 긴 변 상한", () => {
    expect(isPanorama(12000, 3000)).toBe(true);
    expect(variantSize(12000, 3000, "4000")).toEqual({ width: 8000, height: 2000 });
    expect(variantSize(40000, 3000, "4000")).toEqual({ width: 16000, height: 1200 });
    expect(variantSize(12000, 3000, "1200")).toEqual({ width: 2400, height: 600 });
  });

  it("2.5:1까지는 일반 사진", () => {
    expect(isPanorama(5000, 2000)).toBe(false);
    expect(variantSize(5000, 2000, "4000")).toEqual({ width: 4000, height: 1600 });
  });

  it("파노라마는 용량 상한이 더 크다", () => {
    expect(variantMaxBytes(16000, 2000, "4000")).toBe(12 * 1024 * 1024);
    expect(variantMaxBytes(4000, 3000, "4000")).toBe(8 * 1024 * 1024);
  });
});

describe("저장 위치", () => {
  it("DB 키에서 토큰을 뽑고 형식이 틀리면 거부", () => {
    const token = "0123456789abcdef0123456789abcdef";
    expect(storageToken(`p/${token}`)).toBe(token);
    expect(storageToken("p/../../etc")).toBeNull();
    expect(storageToken(token)).toBeNull();
    expect(objectKey(token, "1600")).toBe(`display/${token}/1600.jpg`);
  });
});
