// 브라우저에서 쓰는 WebAssembly 모듈을 public/wasm 으로 복사한다.
// 번들러가 패키지 안의 .wasm · 작업 스레드 경로를 바꾸지 않도록, 같은 출처의 고정 주소로 제공한다.
//  · AVIF 인코더 (@jsquash/avif, 단일 스레드)
//  · RAW 현상 (libraw-wasm: 자체 작업 스레드 + 멀티스레드 → 교차 출처 격리 필요)
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

mkdirSync("public/wasm/libraw", { recursive: true });
copyFileSync(require.resolve("@jsquash/avif/codec/enc/avif_enc.wasm"), "public/wasm/avif_enc.wasm");

const libraw = dirname(require.resolve("libraw-wasm/dist/libraw.wasm"));
for (const file of ["worker.js", "libraw.js", "libraw.wasm"]) {
  copyFileSync(join(libraw, file), join("public/wasm/libraw", file));
}
