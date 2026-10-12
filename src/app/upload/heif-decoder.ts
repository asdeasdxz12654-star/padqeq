// HEIC · HEIF(아이폰 기본 형식) 해석.
// Safari는 브라우저가 직접 열고, Chrome · Edge · Firefox처럼 못 여는 경우에만
// libheif(WebAssembly, LGPL-3.0)를 그때 불러온다. 별도 파일로 나뉘어 처음 화면 크기에는 영향이 없다.

type HeifImage = {
  get_width(): number;
  get_height(): number;
  is_primary?(): boolean;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void): void;
  free?(): void;
};
type LibHeif = { HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] } };

let lib: Promise<LibHeif> | null = null;

function loadLibHeif(): Promise<LibHeif> {
  lib ??= import("libheif-js/libheif-wasm/libheif-bundle.mjs")
    .then((m) => m.default() as LibHeif)
    .catch((error: unknown) => {
      lib = null;
      throw error;
    });
  return lib;
}

const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "mif2"]);

/** 파일 앞부분(ftyp 상자)으로 HEIF 계열인지 본다. 확장자 · MIME은 기기마다 달라 믿지 않는다. */
export async function isHeif(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 12) return false;
  const text = String.fromCharCode(...head.subarray(4, 12));
  return text.startsWith("ftyp") && HEIF_BRANDS.has(text.slice(4));
}

export async function decodeHeif(file: Blob): Promise<ImageBitmap> {
  const libheif = await loadLibHeif();
  const images = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  try {
    // 여러 장이 든 파일(라이브 포토 등)은 대표 이미지만
    const image = images.find((i) => i.is_primary?.()) ?? images[0];
    if (!image) throw new Error("HEIC 사진을 읽지 못했어요");
    const width = image.get_width();
    const height = image.get_height();
    const pixels = new Uint8ClampedArray(width * height * 4);
    // 회전 · 뒤집기(irot · imir)는 libheif가 반영해서 그린다
    const result = await new Promise<unknown>((resolve) => image.display({ data: pixels, width, height }, resolve));
    if (!result) throw new Error("HEIC 사진을 읽지 못했어요");
    return createImageBitmap(new ImageData(pixels, width, height));
  } finally {
    for (const image of images) image.free?.();
  }
}
