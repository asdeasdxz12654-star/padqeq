import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import decodeAvif, { init as initDecoder } from "@jsquash/avif/decode.js"; // 시험에서만 (Node)
import encodeAvif, { init as initEncoder } from "@jsquash/avif/encode.js"; // 시험에서만 (Node)
import { beforeAll, describe, expect, it } from "vitest";
import { detectWatermark, embedWatermark, MATCH_THRESHOLD, seedFromHex, seedToHex } from "./watermark";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasm = (file: string) => WebAssembly.compile(readFileSync(require.resolve(`@jsquash/avif/codec/${file}`)));
  await initEncoder(await wasm("enc/avif_enc.wasm"));
  await (initDecoder as unknown as (m: WebAssembly.Module) => Promise<unknown>)(await wasm("dec/avif_dec.wasm"));
});

type Img = { data: Uint8ClampedArray; width: number; height: number };

/** 사진과 비슷한 시험 이미지: 하늘(부드러운 그라데이션) + 질감 있는 아래쪽 + 잡음 */
function photoLike(width: number, height: number, salt = 1): Img {
  const data = new Uint8ClampedArray(width * height * 4);
  let r = 12345 * salt;
  const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const sky = y < height * 0.45;
      const base = sky
        ? 150 + (60 * y) / height
        : 90 + 40 * Math.sin(x / 13 + salt) * Math.cos(y / 17) + 30 * Math.sin((x + y) / 41);
      const noise = (rand() - 0.5) * (sky ? 2 : 18);
      data[i] = base + noise + 10;
      data[i + 1] = base + noise;
      data[i + 2] = base + noise - 20;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** 단순 평균 축소 (변환본 · 재업로드 흉내) */
function downscale(img: Img, width: number, height: number): Img {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor((x * img.width) / width);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / width));
      const sy0 = Math.floor((y * img.height) / height);
      const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / height));
      for (let ch = 0; ch < 4; ch++) {
        let s = 0;
        for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) s += img.data[(yy * img.width + xx) * 4 + ch]!;
        out[(y * width + x) * 4 + ch] = s / ((sx1 - sx0) * (sy1 - sy0));
      }
    }
  }
  return { data: out, width, height };
}

async function avifRoundTrip(img: Img, quality: number): Promise<Img> {
  const encoded = await encodeAvif(img as ImageData, { quality, speed: 9 });
  const decoded = await decodeAvif(encoded);
  return { data: decoded!.data, width: decoded!.width, height: decoded!.height };
}

function psnr(a: Img, b: Img): number {
  let mse = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) mse += (a.data[i + c]! - b.data[i + c]!) ** 2;
  mse /= (a.data.length / 4) * 3;
  return 10 * Math.log10((255 * 255) / mse);
}

const SEED = seedFromHex("00112233445566778899aabbccddeeff");
const OTHER = seedFromHex("ffeeddccbbaa99887766554433221100");

describe("보이지 않는 워터마크", () => {
  const original = photoLike(1600, 1067);
  const marked = { ...original, data: original.data.slice() };
  embedWatermark(marked, SEED);

  it("눈에 띄지 않는다: 전체 PSNR 40dB 이상, 하늘처럼 매끈한 곳은 밝기 2단계 이내", () => {
    expect(psnr(original, marked)).toBeGreaterThan(40);
    let skyMax = 0;
    for (let y = 0; y < original.height * 0.4; y++) {
      for (let x = 0; x < original.width; x++) {
        const i = (y * original.width + x) * 4;
        skyMax = Math.max(skyMax, Math.abs(marked.data[i]! - original.data[i]!));
      }
    }
    expect(skyMax).toBeLessThanOrEqual(2);
  });

  it("워터마크가 없는 사진 · 다른 열쇠에서는 찾지 못한다 (무작위 열쇠 60개)", () => {
    expect(Math.abs(detectWatermark(original, SEED))).toBeLessThan(MATCH_THRESHOLD / 2);
    expect(Math.abs(detectWatermark(marked, OTHER))).toBeLessThan(MATCH_THRESHOLD / 2);
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      const random = new Uint8Array(16);
      for (let b = 0; b < 16; b++) random[b] = (i * 37 + b * 101 + 7) & 255;
      random[0] = i;
      worst = Math.max(worst, Math.abs(detectWatermark(marked, random)));
    }
    expect(worst).toBeLessThan(MATCH_THRESHOLD);
  });

  it("AVIF 압축 뒤에도 찾는다", async () => {
    const compressed = await avifRoundTrip(marked, 64);
    expect(detectWatermark(compressed, SEED)).toBeGreaterThan(MATCH_THRESHOLD * 2);
  });

  it("줄인 변환본(1200 · 400px)에서도 찾는다", async () => {
    expect(detectWatermark(await avifRoundTrip(downscale(marked, 1200, 800), 64), SEED)).toBeGreaterThan(MATCH_THRESHOLD);
    expect(detectWatermark(downscale(marked, 400, 267), SEED)).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it("열쇠 문자열 변환", () => {
    expect(seedToHex(SEED)).toBe("00112233445566778899aabbccddeeff");
    expect(() => seedFromHex("xyz")).toThrow();
  });
});
