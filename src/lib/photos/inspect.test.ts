import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import encode, { init } from "@jsquash/avif/encode.js"; // 시험에서만 (Node)
import { beforeAll, describe, expect, it } from "vitest";
import { inspectImage } from "./inspect";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasm = require.resolve("@jsquash/avif/codec/enc/avif_enc.wasm");
  await init(await WebAssembly.compile(readFileSync(wasm)));
});

function jpeg({ width, height, exif = false }: { width: number; height: number; exif?: boolean }): ArrayBuffer {
  const parts: number[] = [0xff, 0xd8];
  parts.push(0xff, 0xe0, 0x00, 0x10, ...[..."JFIF"].map((c) => c.charCodeAt(0)), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0);
  if (exif) parts.push(0xff, 0xe1, 0x00, 0x0a, ...[..."Exif"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0);
  parts.push(0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  parts.push(0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0xff, 0xd9);
  return new Uint8Array(parts).buffer;
}

describe("변환본 검사", () => {
  it("AVIF 크기를 읽는다", async () => {
    const data = new Uint8ClampedArray(64 * 40 * 4).fill(180);
    const avif = await encode({ data, width: 64, height: 40, colorSpace: "srgb" } as ImageData, { speed: 10 });
    expect(inspectImage(avif)).toEqual({ ok: true, format: "avif", width: 64, height: 40 });
  });

  it("JPEG 크기를 읽는다", () => {
    expect(inspectImage(jpeg({ width: 1600, height: 1067 }))).toEqual({ ok: true, format: "jpeg", width: 1600, height: 1067 });
  });

  it("EXIF가 남은 JPEG는 거부 (GPS 잔존 방지)", () => {
    expect(inspectImage(jpeg({ width: 100, height: 100, exif: true }))).toMatchObject({ ok: false });
  });

  it("다른 형식 · 깨진 파일은 거부", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>').buffer;
    expect(inspectImage(svg)).toMatchObject({ ok: false });
    expect(inspectImage(new Uint8Array([0xff, 0xd8, 0xff]).buffer)).toMatchObject({ ok: false });
    const fakeAvif = new Uint8Array(32);
    fakeAvif.set([0, 0, 0, 16, ...[..."ftypheic"].map((c) => c.charCodeAt(0))]);
    expect(inspectImage(fakeAvif.buffer)).toMatchObject({ ok: false });
  });
});
