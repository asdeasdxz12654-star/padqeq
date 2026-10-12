import { describe, expect, it } from "vitest";
import { expiryFor, signImagePath, verifyImageRequest } from "./signed-url";

const SECRET = "test-secret-0123456789abcdef0123456789";
const TOKEN = "0123456789abcdef0123456789abcdef";
const NOW = Date.UTC(2026, 9, 12, 6, 2, 30);

const parse = (path: string) => {
  const url = new URL(path, "https://haedam.test");
  const [, , token = "", variant = ""] = url.pathname.split("/");
  return { token, variant, expires: url.searchParams.get("e"), signature: url.searchParams.get("s") };
};

describe("이미지 서명 주소", () => {
  it("서명한 주소는 통과", async () => {
    const path = await signImagePath(SECRET, TOKEN, "1200", NOW);
    expect(path).toMatch(new RegExp(String.raw`^/img/${TOKEN}/1200\?e=\d{10}&s=[A-Za-z0-9_-]{43}$`));
    expect(await verifyImageRequest(SECRET, parse(path), NOW)).toEqual({ ok: true });
  });

  it("같은 5분 구간에서는 같은 주소 (브라우저 캐시)", async () => {
    expect(await signImagePath(SECRET, TOKEN, "1200", NOW)).toBe(await signImagePath(SECRET, TOKEN, "1200", NOW + 20_000));
  });

  it("5~10분 뒤 만료", async () => {
    const exp = expiryFor(NOW) * 1000;
    expect(exp - NOW).toBeGreaterThanOrEqual(300_000);
    expect(exp - NOW).toBeLessThanOrEqual(600_000);
    const path = await signImagePath(SECRET, TOKEN, "1200", NOW);
    expect(await verifyImageRequest(SECRET, parse(path), exp)).toEqual({ ok: false, status: 410 });
  });

  it("크기 · 사진 · 만료를 바꾸면 거부", async () => {
    const req = parse(await signImagePath(SECRET, TOKEN, "1200", NOW));
    expect(await verifyImageRequest(SECRET, { ...req, variant: "4000" }, NOW)).toEqual({ ok: false, status: 403 });
    expect(await verifyImageRequest(SECRET, { ...req, token: "f".repeat(32) }, NOW)).toEqual({ ok: false, status: 403 });
    expect(await verifyImageRequest(SECRET, { ...req, expires: String(Number(req.expires) + 300) }, NOW)).toEqual({
      ok: false,
      status: 403,
    });
  });

  it("다른 키로 서명한 주소는 거부", async () => {
    const req = parse(await signImagePath("other-secret-0123456789abcdef012345", TOKEN, "1200", NOW));
    expect(await verifyImageRequest(SECRET, req, NOW)).toEqual({ ok: false, status: 403 });
  });

  it("형식이 틀린 요청은 400", async () => {
    const req = parse(await signImagePath(SECRET, TOKEN, "1200", NOW));
    expect(await verifyImageRequest(SECRET, { ...req, token: "../etc" }, NOW)).toMatchObject({ status: 400 });
    expect(await verifyImageRequest(SECRET, { ...req, variant: "9999" }, NOW)).toMatchObject({ status: 400 });
    expect(await verifyImageRequest(SECRET, { ...req, signature: null }, NOW)).toMatchObject({ status: 400 });
  });
});
