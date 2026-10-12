// 요청마다 새 nonce로 만드는 Content-Security-Policy.
// worker.ts(엣지)에서 쓰므로 Node·Next 전용 API를 쓰지 않는다.

const TURNSTILE = "https://challenges.cloudflare.com";

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp({
  nonce,
  supabaseUrl,
  dev = false,
}: {
  nonce: string;
  supabaseUrl: string;
  dev?: boolean;
}): string {
  const supabase = new URL(supabaseUrl);
  const supabaseWs = `wss://${supabase.host}`;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // strict-dynamic: nonce가 붙은 스크립트가 불러온 스크립트만 실행
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE, ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", dev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    // SSR로 그려진 style 속성용. 속성 스타일은 스크립트를 실행할 수 없다.
    "style-src-attr": ["'unsafe-inline'"],
    // 사진은 같은 출처의 이미지 게이트(/img)만. 외부 이미지 금지.
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabase.origin, supabaseWs],
    "frame-src": [TURNSTILE],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
