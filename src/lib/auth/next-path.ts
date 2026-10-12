// 로그인 · 가입 뒤 돌아갈 경로.
// 주소창의 ?next= 값을 그대로 쓰면 외부 사이트로 보내는 오픈 리다이렉트가 되므로
// 같은 사이트 안의 경로만 받는다.

const BASE = "https://haedam.invalid";
// 다시 로그인 흐름으로 돌아가는 경로는 막는다 (무한 반복 방지)
const AUTH_PATHS = ["/login", "/welcome", "/auth/"];

export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  // "//evil.com", "/\evil.com"은 브라우저가 외부 주소로 해석한다
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (/\p{Cc}/u.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (AUTH_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p.endsWith("/") ? p : `${p}/`))) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** /login?next=... 처럼 다음 경로를 붙인 주소 */
export function withNext(path: "/login" | "/welcome", next: string): string {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
}
