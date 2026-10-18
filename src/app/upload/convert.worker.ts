// 업로드할 사진을 브라우저에서 변환한다 (P-01 ①). 원본 파일은 서버로 보내지 않는다.
//  · 회전(EXIF 방향)을 반영해 그린 뒤 다시 인코딩 → EXIF · GPS는 남지 않는다
//  · AVIF 4종(4000 · 2560 · 1200 · 400) + 구형 기기용 JPEG 1600
//  · 4000px보다 작은 사진은 키우지 않는다

import { encodeAvif, preloadAvif } from "./avif-encoder";
import { decodeHeif, isHeif } from "./heif-decoder";
import { VARIANT_NAMES, VARIANTS, type VariantName, variantSize } from "@/lib/photos/variants";
import { dHash, PHASH_HEIGHT, PHASH_WIDTH } from "@/lib/photos/phash";
import { embedWatermark, SEED_BYTES, seedToHex } from "@/lib/photos/watermark";

/** 보통은 파일을 그대로, RAW는 화면 쪽에서 현상한 그림(ImageBitmap)을 넘긴다 */
export type ConvertRequest = { id: string; file: File } | { id: string; bitmap: ImageBitmap };
export type ConvertMessage =
  | { id: string; type: "progress"; done: number; total: number }
  | { id: string; type: "done"; width: number; height: number; seed: string; phash: string; color: string; files: Record<VariantName, Blob> }
  | { id: string; type: "error"; message: string };

// DOM 타입과 WebWorker 타입을 함께 켜면 충돌하므로 필요한 부분만 적는다
const scope = self as unknown as {
  postMessage(message: ConvertMessage): void;
  onmessage: ((event: MessageEvent<ConvertRequest>) => void) | null;
};

/** 큰 비율로 줄일 때는 절반씩 나눠 줄여 계단 현상을 줄인다 */
function resize(source: CanvasImageSource & { width: number; height: number }, width: number, height: number) {
  let current: OffscreenCanvas | (CanvasImageSource & { width: number; height: number }) = source;
  let w = source.width;
  let h = source.height;
  while (w / 2 >= width && h / 2 >= height) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    current = draw(current, w, h);
  }
  return w === width && h === height && current instanceof OffscreenCanvas ? current : draw(current, width, height);
}

/** RGBA 픽셀의 평균 색 (#rrggbb) */
function averageColor(data: Uint8ClampedArray): string {
  let r = 0, g = 0, b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
  }
  return `#${[r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("")}`;
}

function draw(source: CanvasImageSource, width: number, height: number, background?: string): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저는 사진 변환을 지원하지 않아요");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** 브라우저가 직접 열 수 있으면 그대로, 못 여는 HEIC는 libheif로 */
async function openImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    if (await isHeif(file)) return decodeHeif(file);
    throw error instanceof Error && error.message ? new Error("이 사진을 열 수 없어요") : error;
  }
}

async function convert(request: ConvertRequest) {
  const { id } = request;
  const post = (message: ConvertMessage) => scope.postMessage(message);
  const total = VARIANT_NAMES.length;

  const [bitmap] = await Promise.all(["bitmap" in request ? Promise.resolve(request.bitmap) : openImage(request.file), preloadAvif()]);
  const master = variantSize(bitmap.width, bitmap.height, "4000");
  const files = {} as Record<VariantName, Blob>;
  // 사진마다 새 워터마크 열쇠. 마스터에 한 번 넣으면 줄인 변환본에도 따라간다.
  const seed = crypto.getRandomValues(new Uint8Array(SEED_BYTES));

  // 큰 것부터 차례로 줄여 가며 만든다 (4000 → 2560 → 1200 → 400)
  let previous: OffscreenCanvas | ImageBitmap = bitmap;
  let marked: OffscreenCanvas | null = null;
  let phash = "";
  let color = "";
  let done = 0;
  for (const name of ["4000", "2560", "1200", "400"] as const) {
    const size = variantSize(master.width, master.height, name);
    const canvas = resize(previous, size.width, size.height);
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.getImageData(0, 0, size.width, size.height);
    if (name === "4000") {
      embedWatermark(pixels, seed);
      ctx.putImageData(pixels, 0, 0);
    }
    const avif = await encodeAvif(pixels, { quality: VARIANTS[name].quality, speed: 7 });
    files[name] = new Blob([avif], { type: "image/avif" });
    if (name === "4000") marked = canvas;
    // 사진 지문: 가장 작은 변환본을 9×8로 줄여서 (재업로드 차단 · 중복 경고용)
    if (name === "400") phash = dHash(draw(canvas, PHASH_WIDTH, PHASH_HEIGHT).getContext("2d")!.getImageData(0, 0, PHASH_WIDTH, PHASH_HEIGHT).data);
    // 대표 색: 사진이 뜨기 전 자리를 칠할 평균 색 (8×8로 줄여 평균)
    if (name === "400") color = averageColor(draw(canvas, 8, 8).getContext("2d")!.getImageData(0, 0, 8, 8).data);
    previous = canvas;
    post({ id, type: "progress", done: ++done, total });
  }

  // 구형 기기용 JPEG: 투명 부분은 흰 바탕으로
  const jpegSize = variantSize(master.width, master.height, "1600");
  const jpegCanvas = draw(resize(marked ?? bitmap, jpegSize.width, jpegSize.height), jpegSize.width, jpegSize.height, "#fff");
  files["1600"] = await jpegCanvas.convertToBlob({ type: "image/jpeg", quality: VARIANTS["1600"].quality });
  post({ id, type: "progress", done: ++done, total });

  bitmap.close();
  post({ id, type: "done", width: master.width, height: master.height, seed: seedToHex(seed), phash, color, files });
}

// 한 번에 한 장씩 (메모리 · CPU 보호)
let queue = Promise.resolve();
scope.onmessage = (event) => {
  const request = event.data;
  queue = queue.then(() =>
    convert(request).catch((error: unknown) =>
      scope.postMessage({
        id: request.id,
        type: "error",
        message: error instanceof Error ? error.message : "변환하지 못했어요",
      } satisfies ConvertMessage),
    ),
  );
};
