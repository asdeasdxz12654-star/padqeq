import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "./csp";

const supabaseUrl = "https://abc.supabase.co";

describe("buildCsp", () => {
  it("운영 정책은 nonce만 허용하고 eval·인라인 스크립트를 막는다", () => {
    const csp = buildCsp({ nonce: "n0nce", supabaseUrl });
    expect(csp).toContain("script-src 'self' 'nonce-n0nce' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/'unsafe-eval'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("style-src 'self' 'nonce-n0nce'");
  });

  it("다른 사이트가 해담을 iframe에 넣지 못한다", () => {
    expect(buildCsp({ nonce: "x", supabaseUrl })).toContain("frame-ancestors 'none'");
  });

  it("해담 안에는 가입 봇 방지(Turnstile) 확인 창만 iframe으로 넣는다", () => {
    expect(buildCsp({ nonce: "x", supabaseUrl })).toContain("frame-src https://challenges.cloudflare.com;");
  });

  it("외부 이미지를 허용하지 않는다", () => {
    const img = buildCsp({ nonce: "x", supabaseUrl })
      .split("; ")
      .find((d) => d.startsWith("img-src"));
    expect(img).toBe("img-src 'self' blob: data: https://tile.openstreetmap.org");
  });

  it("Supabase API와 실시간 연결만 외부 연결로 허용한다", () => {
    const csp = buildCsp({ nonce: "x", supabaseUrl });
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
  });

  it("개발 모드에서만 eval을 허용한다", () => {
    expect(buildCsp({ nonce: "x", supabaseUrl, dev: true })).toContain("'unsafe-eval'");
  });
});

describe("createNonce", () => {
  it("요청마다 다른 128비트 값을 만든다", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });
});
