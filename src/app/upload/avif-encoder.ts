// AVIF 인코더 (libavif WebAssembly, 단일 스레드).
// @jsquash/avif 기본 진입점은 멀티스레드 빌드를 함께 불러오는데, 그 작업 스레드가 자기 자신을
// 다시 불러오는 구조라 빌드 도구가 순환에 빠진다. 멀티스레드는 교차 출처 격리(COEP)가 필요해
// 어차피 쓸 수 없으므로 단일 스레드 코덱만 직접 쓴다.

import avifFactory from "@jsquash/avif/codec/enc/avif_enc.js";
import { defaultOptions, type EncodeOptions } from "@jsquash/avif/meta.js";

type AvifModule = {
  encode(data: BufferSource, width: number, height: number, options: EncodeOptions): Uint8Array | null;
};

let ready: Promise<AvifModule> | null = null;

function load(): Promise<AvifModule> {
  // 같은 출처의 고정 주소 (scripts/copy-wasm.mjs). 실패하면 다음에 다시 시도한다.
  ready ??= (async () => {
    const response = await fetch("/wasm/avif_enc.wasm");
    if (!response.ok) throw new Error("AVIF 인코더를 불러오지 못했어요");
    const wasm = await WebAssembly.compile(await response.arrayBuffer());
    const factory = avifFactory as unknown as (options: Record<string, unknown>) => Promise<AvifModule>;
    return factory({
      noInitialRun: true,
      instantiateWasm(imports: WebAssembly.Imports, callback: (instance: WebAssembly.Instance) => void) {
        const instance = new WebAssembly.Instance(wasm, imports);
        callback(instance);
        return instance.exports;
      },
    });
  })().catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** 미리 불러 두기 (첫 사진 변환을 빠르게) */
export function preloadAvif(): Promise<unknown> {
  return load();
}

export async function encodeAvif(image: ImageData, options: Partial<EncodeOptions>): Promise<Uint8Array<ArrayBuffer>> {
  const avif = await load();
  const output = avif.encode(new Uint8Array(image.data.buffer), image.width, image.height, {
    ...defaultOptions,
    ...options,
    bitDepth: 8,
  });
  if (!output) throw new Error("AVIF로 바꾸지 못했어요");
  // WASM 메모리를 가리키는 보기일 수 있어 복사해 둔다
  return output.slice();
}
