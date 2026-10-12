// Cloudflare Worker 진입점.
// OpenNext가 만든 Next 앱 앞에서 요청마다 다음을 처리한다.
//  1. CSP nonce 발급 (Next가 요청 헤더의 nonce를 자기 스크립트에 붙임)
//  2. Supabase 세션 갱신 (만료된 토큰을 새로 받아 쿠키로 돌려줌)
//  3. 예약 작업: DB 일시정지 방지, 백업 확인
// Next 16의 proxy.ts는 Workers에서 아직 실험 기능이라 이곳에서 처리한다.

import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
// @ts-expect-error -- `opennextjs-cloudflare build`가 만드는 파일
import { default as nextHandler } from "./.open-next/worker.js";
import { buildCsp, createNonce } from "./src/lib/security/csp";

const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1000;
const SESSIONLESS_PREFIXES = ["/img/", "/_next/static/", "/wasm/"];

export default {
  async fetch(request, env, ctx) {
    const nonce = createNonce();
    const csp = buildCsp({ nonce, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL });

    // 클라이언트가 보낸 값은 버리고 서버가 만든 값으로 덮어쓴다 (nonce 위조 방지)
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", csp);
    headers.set("x-nonce", nonce);

    // 사진 · 정적 파일 요청에는 세션이 필요 없다 (이미지 게이트는 서명으로 판단)
    const { pathname } = new URL(request.url);
    const needsSession = !SESSIONLESS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    const setCookies = needsSession ? await refreshSession(request, headers, env) : [];

    const upstream: Response = await nextHandler.fetch(new Request(request, { headers }), env, ctx);
    const response = new Response(upstream.body, upstream);
    response.headers.set("Content-Security-Policy", csp);
    if (setCookies.length > 0) {
      for (const cookie of setCookies) response.headers.append("Set-Cookie", cookie);
      // 새 세션 쿠키가 담긴 응답이 공유 캐시에 남지 않도록
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(Promise.all([keepDatabaseAwake(env), checkLatestBackup(env)]));
  },
} satisfies ExportedHandler<CloudflareEnv>;

/** 액세스 토큰이 만료됐으면 갱신하고, 갱신된 쿠키를 Next로 넘길 요청과 응답 양쪽에 반영한다. */
async function refreshSession(request: Request, headers: Headers, env: CloudflareEnv): Promise<string[]> {
  const incoming = parseCookieHeader(request.headers.get("cookie") ?? "");
  if (!incoming.some(({ name }) => name.startsWith("sb-"))) return [];

  const jar = new Map(incoming.map(({ name, value }) => [name, value]));
  const setCookies: string[] = [];

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
          setCookies.push(serializeCookieHeader(name, value, options));
        }
      },
    },
  });

  // getClaims는 서명을 검증하고, 만료된 경우에만 갱신 요청을 보낸다
  await supabase.auth.getClaims();

  if (setCookies.length > 0) {
    headers.set(
      "cookie",
      [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; "),
    );
  }
  return setCookies;
}

/** Supabase 무료 플랜은 오래 쓰지 않으면 일시정지되므로 매일 가벼운 요청을 보낸다. */
async function keepDatabaseAwake(env: CloudflareEnv): Promise<void> {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/posts?select=id&limit=1`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  });
  if (!res.ok) console.error("[cron] keep-alive failed", res.status);
}

/** GitHub Actions가 매일 올리는 DB 백업이 26시간 안에 들어왔는지 확인한다. */
async function checkLatestBackup(env: CloudflareEnv): Promise<void> {
  // 백업 키는 db/YYYY-MM-DD/... 형식이므로 오늘·어제 날짜만 본다
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const listings = await Promise.all([0, 1].map((offset) => env.BACKUPS.list({ prefix: `db/${day(offset)}/` })));
  const newest = listings
    .flatMap((listing) => listing.objects)
    .reduce<Date | null>((latest, obj) => (!latest || obj.uploaded > latest ? obj.uploaded : latest), null);
  if (!newest || Date.now() - newest.getTime() > BACKUP_MAX_AGE_MS) {
    console.error("[cron] DB backup is missing or stale", newest?.toISOString() ?? "none");
  }
}
