// 사진 열람 속도 제한 (P-02 · AI 브라우저 에이전트 대응)
//  · 접속 주소(IP)마다, 로그인했으면 계정마다 1분에 정해진 장수까지
//  · 계정 키는 세션 쿠키의 사용자 id를 서명 확인 없이 읽는다. 사진 요청마다 토큰을 검증하면 느려서다.
//    값을 바꿔 계정 제한을 피해도 IP 제한은 그대로 걸린다.

/** 1분에 허용하는 사진 요청 수 (wrangler.jsonc ratelimits와 같게) */
export const IMAGE_LIMITS = { perAccount: 120, perIp: 300 } as const;

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** Supabase 세션 쿠키(sb-<ref>-auth-token, 나뉘면 .0 .1 …)에서 사용자 id. 없거나 형식이 다르면 null */
export function sessionUserId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  const base = [...cookies.keys()].find((name) => /^sb-[a-z0-9]+-auth-token(\.0)?$/.test(name))?.replace(/\.0$/, "");
  if (!base) return null;
  let raw = cookies.get(base) ?? "";
  if (!raw) for (let i = 0; cookies.has(`${base}.${i}`); i++) raw += cookies.get(`${base}.${i}`);

  let json = decodeURIComponent(raw);
  if (json.startsWith("base64-")) json = decodeBase64Url(json.slice(7)) ?? "";
  try {
    const token = (JSON.parse(json) as { access_token?: unknown }).access_token;
    if (typeof token !== "string") return null;
    const payload = decodeBase64Url(token.split(".")[1] ?? "");
    const sub = payload ? (JSON.parse(payload) as { sub?: unknown }).sub : null;
    return typeof sub === "string" && /^[0-9a-f-]{36}$/.test(sub) ? sub : null;
  } catch {
    return null;
  }
}
