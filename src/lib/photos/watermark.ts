// 보이지 않는 워터마크 (P-02 "변환본에 게시물 ID 삽입").
//
// 사진마다 무작위 열쇠(seed, 16바이트)로 ±1 무늬를 만들고, 사진 밝기에 아주 옅게 더한다.
//  · 무늬는 긴 변 128칸짜리 거친 격자 → 압축(AVIF · JPEG) · 크기 조절을 거쳐도 남는다
//  · 칸 사이는 부드럽게 이어 붙이고(쌍선형), 질감이 많은 곳에 더 세게 · 평평한 곳(하늘 등)은 약하게
//  · 열쇠를 모르면 무늬를 재현할 수 없어 지우기 어렵다. 열쇠는 비공개 DB에만 둔다.
// 판정은 "이 사진에서 이 열쇠의 무늬가 보이는가"(0비트 워터마크). 잘라내기(크롭)에는 약하다.

export const SEED_BYTES = 16;
const GRID_LONG = 128;
const GRID_SHORT_MIN = 16;
const STRENGTH_MIN = 0.7;
// 세기(밝기 단계, 0~255 기준): 차분한 곳 0.7 · 질감이 큰 곳 최대 4.
// 실제 사진에서 PSNR 약 41dB, 압축 · 축소 · 재저장 뒤 판정 점수 약 11 (2026-10-12 측정)
const STRENGTH_MAX = 4;
const STRENGTH_SLOPE = 0.2;

/** 이 값보다 크면 같은 열쇠로 넣은 무늬로 본다 (무관한 사진은 대략 ±3 안) */
export const MATCH_THRESHOLD = 6;

export function gridSize(width: number, height: number): { gw: number; gh: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const shortCells = Math.max(GRID_SHORT_MIN, Math.round((GRID_LONG * short) / long));
  return width >= height ? { gw: GRID_LONG, gh: shortCells } : { gw: shortCells, gh: GRID_LONG };
}

/** 열쇠에서 ±1 무늬 (sfc32 의사난수) */
export function patternFor(seed: Uint8Array, gw: number, gh: number): Int8Array {
  if (seed.length !== SEED_BYTES) throw new Error("워터마크 열쇠 길이가 맞지 않아요");
  const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
  let a = view.getUint32(0);
  let b = view.getUint32(4);
  let c = view.getUint32(8);
  let d = view.getUint32(12);
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) next();
  const pattern = new Int8Array(gw * gh);
  for (let i = 0; i < pattern.length; i++) pattern[i] = next() & 1 ? 1 : -1;
  return pattern;
}

type Pixels = { data: Uint8ClampedArray; width: number; height: number };

const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;

/** 칸마다 밝기 평균 · 표준편차 */
function cellStats(img: Pixels, gw: number, gh: number) {
  const sum = new Float64Array(gw * gh);
  const sq = new Float64Array(gw * gh);
  const count = new Uint32Array(gw * gh);
  const { data, width, height } = img;
  for (let y = 0; y < height; y++) {
    const cy = Math.min(gh - 1, Math.floor((y * gh) / height));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(gw - 1, Math.floor((x * gw) / width));
      const c = cy * gw + cx;
      const l = luma(data, (y * width + x) * 4);
      sum[c]! += l;
      sq[c]! += l * l;
      count[c]!++;
    }
  }
  const mean = new Float64Array(gw * gh);
  const std = new Float64Array(gw * gh);
  for (let c = 0; c < mean.length; c++) {
    const n = count[c] || 1;
    mean[c] = sum[c]! / n;
    std[c] = Math.sqrt(Math.max(0, sq[c]! / n - mean[c]! ** 2));
  }
  return { mean, std };
}

/** 픽셀 위치로 정해지는 -0.5 ~ 0.5 값 (같은 사진은 항상 같은 결과) */
function dither(x: number, y: number): number {
  let h = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 1024) / 1024 - 0.5;
}

/** 사진에 무늬를 넣는다 (제자리 수정). 마스터 크기에서 한 번 넣으면 줄인 변환본에도 따라간다. */
export function embedWatermark(img: Pixels, seed: Uint8Array): void {
  const { gw, gh } = gridSize(img.width, img.height);
  const pattern = patternFor(seed, gw, gh);
  const { mean } = cellStats(img, gw, gh);
  const { strength } = analyse(mean, gw, gh);

  // 칸마다 세기: 주변이 출렁이는 곳(질감)일수록 세게, 차분한 곳은 약하게
  const amp = new Float32Array(gw * gh);
  for (let c = 0; c < amp.length; c++) amp[c] = pattern[c]! * strength[c]!;

  const { data, width, height } = img;
  for (let y = 0; y < height; y++) {
    // 칸 중심 기준 쌍선형 보간
    const fy = Math.min(gh - 1, Math.max(0, ((y + 0.5) * gh) / height - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(gw - 1, Math.max(0, ((x + 0.5) * gw) / width - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const tx = fx - x0;
      const top = amp[y0 * gw + x0]! * (1 - tx) + amp[y0 * gw + x1]! * tx;
      const bottom = amp[y1 * gw + x0]! * (1 - tx) + amp[y1 * gw + x1]! * tx;
      // 0.5보다 작은 변화는 8비트로 저장할 때 반올림으로 사라지므로 확률적으로 반올림한다
      // (픽셀마다 정해진 ±0.5 흔들림을 더함 → 평균은 정확히 delta만큼 바뀜)
      const delta = top * (1 - ty) + bottom * ty + dither(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i]! + delta;
      data[i + 1] = data[i + 1]! + delta;
      data[i + 2] = data[i + 2]! + delta;
    }
  }
}


/** 칸마다 "주변 5×5 칸 평균과의 차" (사진 자체의 큰 밝기 변화를 빼고 칸 단위 변화만 남김) */
function highPass(values: Float64Array, gw: number, gh: number): Float64Array {
  const out = new Float64Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      let s = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const yy = cy + dy;
          const xx = cx + dx;
          if (yy < 0 || yy >= gh || xx < 0 || xx >= gw) continue;
          s += values[yy * gw + xx]!;
          n++;
        }
      }
      out[cy * gw + cx] = values[cy * gw + cx]! - s / n;
    }
  }
  return out;
}

/** 넣은 무늬(쌍선형으로 이은 칸 값)를 칸마다 평균 낸 모양 = 검출할 때 기대하는 응답 */
function expectedCellResponse(amp: Float32Array, gw: number, gh: number): Float64Array {
  const SUB = 4;
  const out = new Float64Array(gw * gh);
  const at = (x: number, y: number) => amp[y * gw + x]!;
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      let s = 0;
      for (let sy = 0; sy < SUB; sy++) {
        const fy = Math.min(gh - 1, Math.max(0, cy + (sy + 0.5) / SUB - 0.5));
        const y0 = Math.floor(fy);
        const y1 = Math.min(gh - 1, y0 + 1);
        const ty = fy - y0;
        for (let sx = 0; sx < SUB; sx++) {
          const fx = Math.min(gw - 1, Math.max(0, cx + (sx + 0.5) / SUB - 0.5));
          const x0 = Math.floor(fx);
          const x1 = Math.min(gw - 1, x0 + 1);
          const tx = fx - x0;
          s += (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
        }
      }
      out[cy * gw + cx] = s / (SUB * SUB);
    }
  }
  return out;
}

/**
 * 무늬가 들어 있는 정도 (z 점수에 가까운 값). 크기만 바뀐 사진(같은 비율)이면 그대로 판정한다.
 * 칸 안의 질감(표준편차)이 클수록 사진 자체 변화가 커서 믿을 만한 정도를 낮춘다(가중).
 */
export function detectWatermark(img: Pixels, seed: Uint8Array): number {
  const { gw, gh } = gridSize(img.width, img.height);
  const pattern = patternFor(seed, gw, gh);
  const { mean } = cellStats(img, gw, gh);
  const { residual, localVar, strength } = analyse(mean, gw, gh);

  const amp = new Float32Array(gw * gh);
  for (let c = 0; c < amp.length; c++) amp[c] = pattern[c]! * strength[c]!;
  const template = highPass(expectedCellResponse(amp, gw, gh), gw, gh);

  // 가중치: 주변이 차분할수록(잔차가 작을수록) 무늬가 잘 드러나므로 크게
  let dot = 0;
  let variance = 0;
  for (let c = 0; c < residual.length; c++) {
    const weight = 1 / (localVar[c]! + 0.25);
    dot += weight * template[c]! * residual[c]!;
    variance += weight ** 2 * template[c]! ** 2 * residual[c]! ** 2;
  }
  return variance === 0 ? 0 : dot / Math.sqrt(variance);
}

/** 칸 평균에서 잔차(고주파) · 주변 출렁임(5×5 잔차 제곱 평균) · 넣을 세기 */
function analyse(mean: Float64Array, gw: number, gh: number) {
  const residual = highPass(mean, gw, gh);
  const localVar = new Float64Array(gw * gh);
  const strength = new Float32Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      let s2 = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const yy = cy + dy;
          const xx = cx + dx;
          if (yy < 0 || yy >= gh || xx < 0 || xx >= gw) continue;
          s2 += residual[yy * gw + xx]! ** 2;
          n++;
        }
      }
      const c = cy * gw + cx;
      localVar[c] = s2 / n;
      strength[c] = Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, STRENGTH_MIN + STRENGTH_SLOPE * Math.sqrt(localVar[c]!)));
    }
  }
  return { residual, localVar, strength };
}

export function seedToHex(seed: Uint8Array): string {
  return Array.from(seed, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function seedFromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error("워터마크 열쇠 형식이 맞지 않아요");
  return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
}
