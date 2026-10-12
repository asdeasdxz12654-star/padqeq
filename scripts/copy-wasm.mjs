// 브라우저 AVIF 인코더(WebAssembly)를 public/wasm 으로 복사한다.
// 번들러가 패키지 안의 .wasm 경로를 바꾸지 않도록, 같은 출처의 고정 주소로 제공한다.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("@jsquash/avif/codec/enc/avif_enc.wasm");
mkdirSync("public/wasm", { recursive: true });
copyFileSync(source, "public/wasm/avif_enc.wasm");
