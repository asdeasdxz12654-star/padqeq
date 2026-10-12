// 업로드할 사진을 브라우저에서 변환한다 (P-01 ①). 원본 파일은 서버로 보내지 않는다.
//  · 회전(EXIF 방향)을 반영해 그린 뒤 다시 인코딩 → EXIF · GPS는 남지 않는다
//  · AVIF 4종(4000 · 2560 · 1200 · 400) + 구형 기기용 JPEG 1600
//  · 4000px보다 작은 사진은 키우지 않는다

import { encodeAvif, preloadAvif } from "./avif-encoder";
import { VARIANT_NAMES, VARIANTS, type VariantName, variantSize } from "@/lib/photos/variants";

export type ConvertRequest = { id: string; file: File };
export type ConvertMessage =
  | { id: string; type: "progress"; done: number; total: number }
  | { id: string; type: "done"; width: number; height: number; files: Record<VariantName, Blob> }
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

async function convert({ id, file }: ConvertRequest) {
  const post = (message: ConvertMessage) => scope.postMessage(message);
  const total = VARIANT_NAMES.length;

  const [bitmap] = await Promise.all([
    createImageBitmap(file, { imageOrientation: "from-image" }),
    preloadAvif(),
  ]);
  const master = variantSize(bitmap.width, bitmap.height, "4000");
  const files = {} as Record<VariantName, Blob>;

  // 큰 것부터 차례로 줄여 가며 만든다 (4000 → 2560 → 1200 → 400)
  let previous: OffscreenCanvas | ImageBitmap = bitmap;
  let done = 0;
  for (const name of ["4000", "2560", "1200", "400"] as const) {
    const size = variantSize(master.width, master.height, name);
    const canvas = resize(previous, size.width, size.height);
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, size.width, size.height);
    const avif = await encodeAvif(pixels, { quality: VARIANTS[name].quality, speed: 7 });
    files[name] = new Blob([avif], { type: "image/avif" });
    previous = canvas;
    post({ id, type: "progress", done: ++done, total });
  }

  // 구형 기기용 JPEG: 투명 부분은 흰 바탕으로
  const jpegSize = variantSize(master.width, master.height, "1600");
  const jpegCanvas = draw(resize(bitmap, jpegSize.width, jpegSize.height), jpegSize.width, jpegSize.height, "#fff");
  files["1600"] = await jpegCanvas.convertToBlob({ type: "image/jpeg", quality: VARIANTS["1600"].quality });
  post({ id, type: "progress", done: ++done, total });

  bitmap.close();
  post({ id, type: "done", width: master.width, height: master.height, files });
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
