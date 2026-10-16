// 웹 푸시 보내기 (VAPID, RFC 8292). 내용 없는 푸시만 보내므로 메시지 암호화(RFC 8291)는 필요 없다.
// 기기가 푸시를 받으면 서비스 워커가 해담에서 새 알림 문구를 가져온다 (public/sw.js).
// Web Crypto만 쓴다 (Workers · Node 공통).

const enc = new TextEncoder();
const b64u = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const fromB64u = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

export type VapidKeys = {
  /** 공개 키: 압축하지 않은 P-256 점 (65바이트) base64url — 브라우저 구독에도 쓴다 */
  publicKey: string;
  /** 비공개 키 d (32바이트) base64url — Worker 비밀값 */
  privateKey: string;
  /** 연락처 (mailto:) */
  subject: string;
};

const keyCache = new Map<string, Promise<CryptoKey>>();

function signingKey({ publicKey, privateKey }: VapidKeys): Promise<CryptoKey> {
  const cacheKey = publicKey + privateKey;
  let key = keyCache.get(cacheKey);
  if (!key) {
    const point = fromB64u(publicKey);
    if (point.length !== 65 || point[0] !== 4) throw new Error("VAPID 공개 키 형식이 맞지 않아요");
    key = crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: b64u(point.slice(1, 33)), y: b64u(point.slice(33, 65)), d: privateKey, ext: false },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    keyCache.set(cacheKey, key);
  }
  return key;
}

/** 푸시 서비스(endpoint의 출처)에 보낼 VAPID 서명 (12시간 유효) */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, nowMs: number = Date.now()): Promise<string> {
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: keys.subject })));
  const unsigned = `${header}.${claims}`;
  // Web Crypto의 ECDSA 서명은 r ‖ s (64바이트) — JWS(ES256) 형식 그대로
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(keys), enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64u(signature)}, k=${keys.publicKey}`;
}

export type PushResult = "sent" | "gone" | "failed";

/** 내용 없는 푸시 하나. 기기가 없어졌으면(404 · 410) "gone" */
export async function sendEmptyPush(endpoint: string, keys: VapidKeys): Promise<PushResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: await vapidAuthorization(endpoint, keys), TTL: "3600", Urgency: "normal", "Content-Length": "0" },
    });
    if (response.ok) return "sent";
    return response.status === 404 || response.status === 410 ? "gone" : "failed";
  } catch {
    return "failed";
  }
}
