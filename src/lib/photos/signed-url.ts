// 이미지 게이트(/img) 서명 주소.
// 서버가 화면을 그릴 때 볼 권한(RLS)을 확인한 사진에만 서명을 붙인다.
// 게이트는 DB를 다시 보지 않고 서명과 만료만 확인한다 → 빠르고, 주소를 밖에 퍼뜨려도 금방 막힌다.
// Web Crypto만 쓴다 (Workers · Node 공통).

import { isVariantName, STORAGE_TOKEN, type VariantName } from "./variants";

/** 주소 유효 시간. 같은 구간 안에서는 주소가 같아 브라우저 캐시가 그대로 쓰인다. */
export const URL_WINDOW_SECONDS = 300;

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

const toBase64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const payload = (token: string, variant: VariantName, expires: number) => `img:v1:${token}:${variant}:${expires}`;

/** 다음 구간 끝까지 유효 (5~10분) */
export function expiryFor(nowMs: number): number {
  const now = Math.floor(nowMs / 1000);
  return (Math.floor(now / URL_WINDOW_SECONDS) + 2) * URL_WINDOW_SECONDS;
}

export async function signImagePath(
  secret: string,
  token: string,
  variant: VariantName,
  nowMs: number = Date.now(),
): Promise<string> {
  const expires = expiryFor(nowMs);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload(token, variant, expires)));
  return `/img/${token}/${variant}?e=${expires}&s=${toBase64Url(signature)}`;
}

export type GateCheck = { ok: true } | { ok: false; status: 400 | 403 | 410 };

export async function verifyImageRequest(
  secret: string,
  { token, variant, expires, signature }: { token: string; variant: string; expires: string | null; signature: string | null },
  nowMs: number = Date.now(),
): Promise<GateCheck> {
  if (!STORAGE_TOKEN.test(token) || !isVariantName(variant) || !expires || !/^\d{10}$/.test(expires) || !signature) {
    return { ok: false, status: 400 };
  }
  const sig = fromBase64Url(signature);
  if (!sig) return { ok: false, status: 400 };
  const exp = Number(expires);
  // 미래로 너무 먼 만료값은 위조로 본다
  if (exp > Math.floor(nowMs / 1000) + URL_WINDOW_SECONDS * 3) return { ok: false, status: 403 };
  // verify는 상수 시간 비교
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(payload(token, variant, exp)));
  if (!valid) return { ok: false, status: 403 };
  if (exp * 1000 <= nowMs) return { ok: false, status: 410 };
  return { ok: true };
}
