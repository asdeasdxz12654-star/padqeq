// libheif-js는 ESM 번들의 타입 선언을 싣지 않는다. 쓰는 형태는 src/app/upload/heif-decoder.ts에 따로 적는다.
declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  const factory: () => unknown;
  export default factory;
}
