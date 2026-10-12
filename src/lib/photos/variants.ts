// 사진 변환본 규격 (P-01 저장 기준). 브라우저(만들기)와 서버(검사)가 같은 규칙을 쓴다.
//  · 일반: 긴 변을 맞춘다. 원본보다 키우지 않는다.
//  · 파노라마(가로세로 2.5:1 초과): 짧은 변을 맞추고, 긴 변 상한을 따로 둔다.

export const VARIANT_NAMES = ["4000", "2560", "1200", "400", "1600"] as const;
export type VariantName = (typeof VARIANT_NAMES)[number];

type VariantSpec = {
  format: "avif" | "jpeg";
  /** 일반 사진의 긴 변 상한 */
  longEdge: number;
  /** 파노라마의 짧은 변 · 긴 변 상한 */
  panoramaShort: number;
  panoramaLong: number;
  /** 서버가 받는 최대 크기 (일반 / 파노라마) */
  maxBytes: number;
  panoramaMaxBytes: number;
  /** 브라우저 인코딩 품질 */
  quality: number;
};

const MB = 1024 * 1024;

export const VARIANTS: Record<VariantName, VariantSpec> = {
  // 마스터 · 확대 보기
  "4000": { format: "avif", longEdge: 4000, panoramaShort: 2000, panoramaLong: 16000, maxBytes: 8 * MB, panoramaMaxBytes: 12 * MB, quality: 72 },
  // 상세 화면
  "2560": { format: "avif", longEdge: 2560, panoramaShort: 1280, panoramaLong: 10240, maxBytes: 4 * MB, panoramaMaxBytes: 6 * MB, quality: 70 },
  // 피드
  "1200": { format: "avif", longEdge: 1200, panoramaShort: 600, panoramaLong: 4800, maxBytes: 1.5 * MB, panoramaMaxBytes: 2 * MB, quality: 64 },
  // 썸네일
  "400": { format: "avif", longEdge: 400, panoramaShort: 200, panoramaLong: 1600, maxBytes: 256 * 1024, panoramaMaxBytes: 384 * 1024, quality: 60 },
  // AVIF를 못 여는 구형 기기용 (iOS 16.4 미만 등)
  "1600": { format: "jpeg", longEdge: 1600, panoramaShort: 800, panoramaLong: 6400, maxBytes: 2 * MB, panoramaMaxBytes: 3 * MB, quality: 0.85 },
};

export const PANORAMA_RATIO = 2.5;

export function isPanorama(width: number, height: number): boolean {
  return Math.max(width, height) / Math.min(width, height) > PANORAMA_RATIO;
}

/** 원본(또는 마스터) 크기에서 변환본 크기를 구한다. 키우지 않는다. */
export function variantSize(width: number, height: number, name: VariantName): { width: number; height: number } {
  const spec = VARIANTS[name];
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale = isPanorama(width, height)
    ? Math.min(1, spec.panoramaShort / short, spec.panoramaLong / long)
    : Math.min(1, spec.longEdge / long);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function variantMaxBytes(masterWidth: number, masterHeight: number, name: VariantName): number {
  const spec = VARIANTS[name];
  return isPanorama(masterWidth, masterHeight) ? spec.panoramaMaxBytes : spec.maxBytes;
}

export function variantFile(name: VariantName): string {
  return `${name}.${VARIANTS[name].format === "avif" ? "avif" : "jpg"}`;
}

export function variantContentType(name: VariantName): string {
  return VARIANTS[name].format === "avif" ? "image/avif" : "image/jpeg";
}

export function isVariantName(value: unknown): value is VariantName {
  return typeof value === "string" && (VARIANT_NAMES as readonly string[]).includes(value);
}

/** DB storage_key("p/<32hex>") ↔ 주소에 쓰는 토큰("<32hex>") */
export const STORAGE_TOKEN = /^[0-9a-f]{32}$/;

export function storageToken(storageKey: string): string | null {
  const token = storageKey.startsWith("p/") ? storageKey.slice(2) : "";
  return STORAGE_TOKEN.test(token) ? token : null;
}

export function objectKey(token: string, name: VariantName): string {
  return `display/${token}/${variantFile(name)}`;
}
