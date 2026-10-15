import "server-only";
import { signImagePath } from "./signed-url";
import { storageToken, type VariantName, variantSize } from "./variants";

/**
 * 이미지 게이트 서명 키 (서버 비밀값).
 * 배포: `wrangler secret put IMAGE_URL_SECRET`, 로컬: .env.local
 */
export function imageUrlSecret(): string {
  const secret = process.env.IMAGE_URL_SECRET;
  if (!secret || secret.length < 32) throw new Error("IMAGE_URL_SECRET이 없거나 너무 짧습니다 (32자 이상)");
  return secret;
}

export type PhotoSources = {
  /** AVIF srcset (400w · 1200w · 2560w) */
  avifSrcSet: string;
  /** AVIF를 못 여는 기기용 JPEG */
  fallback: string;
};

/**
 * 화면에 넣을 서명 주소들. 호출하는 쪽은 이 사진을 볼 권한을 RLS로 이미 확인한 상태여야 한다
 * (DB에서 읽어 온 행만 넘긴다).
 */
export async function photoSources(
  photo: { storage_key: string; width: number; height: number },
  sizes: VariantName[] = ["400", "1200", "2560"],
): Promise<PhotoSources | null> {
  const token = storageToken(photo.storage_key);
  if (!token) return null;
  const secret = imageUrlSecret();
  // 작은 사진은 변환본끼리 너비가 같을 수 있다 (키우지 않으므로). srcset에는 너비마다 하나만.
  const seen = new Set<number>();
  const unique = sizes.filter((name) => {
    const { width } = variantSize(photo.width, photo.height, name);
    if (seen.has(width)) return false;
    seen.add(width);
    return true;
  });
  const avif = await Promise.all(
    unique.map(async (name) => `${await signImagePath(secret, token, name)} ${variantSize(photo.width, photo.height, name).width}w`),
  );
  return { avifSrcSet: avif.join(", "), fallback: await signImagePath(secret, token, "1600") };
}

export type ViewerSources = {
  /** 화면 너비에 맞춰 고를 AVIF (작은 것부터) */
  avif: { width: number; url: string }[];
  /** AVIF를 못 여는 기기용 */
  jpeg: string;
  /** 썸네일 줄 (PC, 여러 장일 때) */
  thumb: string;
};

/** 상세 뷰어(canvas)용 서명 주소. photoSources와 마찬가지로 RLS로 읽은 행만 넘긴다. */
export async function viewerSources(photo: {
  storage_key: string;
  width: number;
  height: number;
}): Promise<ViewerSources | null> {
  const token = storageToken(photo.storage_key);
  if (!token) return null;
  const secret = imageUrlSecret();
  const avif = await Promise.all(
    (["1200", "2560"] as const).map(async (name) => ({
      width: variantSize(photo.width, photo.height, name).width,
      url: await signImagePath(secret, token, name),
    })),
  );
  return { avif, jpeg: await signImagePath(secret, token, "1600"), thumb: await signImagePath(secret, token, "400") };
}
