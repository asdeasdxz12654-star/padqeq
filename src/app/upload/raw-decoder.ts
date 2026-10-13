"use client";

import exifr from "exifr";
import { findLargestEmbeddedJpeg } from "@/lib/photos/raw-preview";

// RAW 해석 (P-01 · A-02). 회원 브라우저 안에서만 처리하고 RAW 파일은 서버로 보내지 않는다.
//  1. 내장 미리보기 JPEG가 2560px 이상이면 그것을 쓴다 (빠름, 모든 기기)
//  2. 작으면 PC에서만 LibRaw(WebAssembly)로 전체 현상 (몇 초 · 메모리 수백 MB)
//  3. 휴대폰은 내장 미리보기만 (작아도 그대로, 화면에 알림)

export const RAW_PREVIEW_MIN_EDGE = 2560;
export const RAW_MAX_BYTES_DESKTOP = 200 * 1024 * 1024;
export const RAW_MAX_BYTES_MOBILE = 100 * 1024 * 1024;

export type RawMethod = "preview" | "full" | "preview-small";
export type RawDecoded = { bitmap: ImageBitmap; method: RawMethod; takenAt: string | null };

export function isMobileDevice(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  return data?.mobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function decodeRaw(file: File): Promise<RawDecoded> {
  const buffer = await file.arrayBuffer();
  const [meta, preview] = await Promise.all([
    exifr
      .parse(buffer, { pick: ["Orientation", "DateTimeOriginal"], translateValues: false })
      .catch(() => null) as Promise<{ Orientation?: number; DateTimeOriginal?: Date } | null>,
    Promise.resolve(findLargestEmbeddedJpeg(buffer)),
  ]);
  const orientation = typeof meta?.Orientation === "number" ? meta.Orientation : 1;
  let takenAt = validDate(meta?.DateTimeOriginal);

  const previewBlob = preview ? new Blob([buffer.slice(preview.offset, preview.offset + preview.length)], { type: "image/jpeg" }) : null;
  // CR3처럼 RAW에서 날짜를 못 읽으면 미리보기 JPEG의 EXIF에서
  if (!takenAt && previewBlob) {
    const fromPreview = (await exifr.parse(previewBlob, ["DateTimeOriginal"]).catch(() => null)) as { DateTimeOriginal?: Date } | null;
    takenAt = validDate(fromPreview?.DateTimeOriginal);
  }

  const bigEnough = preview !== null && Math.max(preview.width, preview.height) >= RAW_PREVIEW_MIN_EDGE;
  if (previewBlob && bigEnough) {
    return { bitmap: await orient(await createImageBitmap(previewBlob), orientation), method: "preview", takenAt };
  }

  if (!isMobileDevice() && globalThis.crossOriginIsolated) {
    try {
      return { bitmap: await developWithLibRaw(buffer), method: "full", takenAt };
    } catch (error) {
      if (!previewBlob) throw error;
    }
  }

  if (previewBlob) {
    return { bitmap: await orient(await createImageBitmap(previewBlob), orientation), method: "preview-small", takenAt };
  }
  throw new Error("이 RAW 파일은 읽을 수 없어요");
}

function validDate(value: unknown): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

/** 미리보기 JPEG에는 방향 정보가 없는 경우가 많아 RAW의 EXIF 방향(1~8)을 직접 반영한다 */
async function orient(bitmap: ImageBitmap, orientation: number): Promise<ImageBitmap> {
  if (orientation <= 1 || orientation > 8) return bitmap;
  const { width: w, height: h } = bitmap;
  const swap = orientation >= 5;
  const canvas = new OffscreenCanvas(swap ? h : w, swap ? w : h);
  const ctx = canvas.getContext("2d")!;
  // EXIF 방향별 변환 행렬
  const transforms: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, w, 0],
    3: [-1, 0, 0, -1, w, h],
    4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, h, 0],
    7: [0, -1, -1, 0, h, w],
    8: [0, -1, 1, 0, 0, w],
  };
  ctx.setTransform(...transforms[orientation]!);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.transferToImageBitmap();
}

/**
 * LibRaw 전체 현상. 패키지의 작업 스레드를 같은 출처 고정 주소(/wasm/libraw, scripts/copy-wasm.mjs)로
 * 직접 띄운다. 멀티스레드 빌드라 교차 출처 격리(COEP)가 필요하다. 끝나면 스레드를 닫아 메모리를 돌려준다.
 */
async function developWithLibRaw(buffer: ArrayBuffer): Promise<ImageBitmap> {
  const worker = new Worker("/wasm/libraw/worker.js", { type: "module" });
  let nextId = 0;
  const call = <T,>(fn: string, ...args: unknown[]) =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      const onMessage = (event: MessageEvent<{ id: number; out?: T; error?: string }>) => {
        if (event.data?.id !== id) return;
        worker.removeEventListener("message", onMessage);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.out as T);
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", () => reject(new Error("RAW 현상 도구를 불러오지 못했어요")), { once: true });
      worker.postMessage({ id, fn, args });
    });

  try {
    // 카메라 화이트밸런스 · sRGB · 8비트 · AHD 보간. 방향은 LibRaw가 반영한다.
    await call("open", new Uint8Array(buffer), { useCameraWb: true, outputColor: 1, outputBps: 8, userQual: 3 });
    const image = await call<{ width: number; height: number; colors: number; data: Uint8Array }>("imageData");
    if (image.colors !== 3 && image.colors !== 4) throw new Error("지원하지 않는 RAW 색 형식이에요");

    const rgba = new Uint8ClampedArray(image.width * image.height * 4);
    const src = image.data;
    for (let p = 0, s = 0; p < rgba.length; p += 4, s += image.colors) {
      rgba[p] = src[s]!;
      rgba[p + 1] = src[s + 1]!;
      rgba[p + 2] = src[s + 2]!;
      rgba[p + 3] = 255;
    }
    return await createImageBitmap(new ImageData(rgba, image.width, image.height));
  } finally {
    worker.terminate();
  }
}
