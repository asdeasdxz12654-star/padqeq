import { describe, expect, it } from "vitest";
import { evidenceFileProblem, evidenceObjectKey, sniffEvidence } from "./evidence";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v]))).buffer;

describe("sniffEvidence", () => {
  it("파일 앞부분으로 형식을 판별한다", () => {
    expect(sniffEvidence(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffEvidence(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffEvidence(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
  });

  it("다른 형식 · 짧은 파일은 거부한다", () => {
    expect(sniffEvidence(bytes("GIF89a"))).toBeNull();
    expect(sniffEvidence(bytes("<svg"))).toBeNull();
    expect(sniffEvidence(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffEvidence(new ArrayBuffer(0))).toBeNull();
  });
});

describe("evidenceObjectKey", () => {
  it("정해진 형식의 키만 저장 경로로 바꾼다", () => {
    expect(evidenceObjectKey(`e/${"a".repeat(32)}`)).toBe(`evidence/${"a".repeat(32)}`);
    expect(evidenceObjectKey(`p/${"a".repeat(32)}`)).toBeNull();
    expect(evidenceObjectKey(`e/../${"a".repeat(29)}`)).toBeNull();
  });
});

describe("evidenceFileProblem", () => {
  it("형식 · 용량을 확인한다", () => {
    expect(evidenceFileProblem({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(evidenceFileProblem({ name: "a.heic", type: "image/heic", size: 1000 })).toMatch(/JPEG/);
    expect(evidenceFileProblem({ name: "a.png", type: "image/png", size: 10 * 1024 * 1024 + 1 })).toMatch(/10MB/);
  });
});
