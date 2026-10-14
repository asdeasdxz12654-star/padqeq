import { describe, expect, it } from "vitest";
import { sessionUserId } from "./image-rate-limit";

const SUB = "00000000-0000-4000-8000-000000000001";
const b64url = (s: string) => btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const jwt = `${b64url('{"alg":"ES256"}')}.${b64url(JSON.stringify({ sub: SUB, aal: "aal1" }))}.sig`;
const session = `base64-${b64url(JSON.stringify({ access_token: jwt, refresh_token: "r" }))}`;

describe("sessionUserId", () => {
  it("세션 쿠키에서 사용자 id를 읽는다", () => {
    expect(sessionUserId(`theme=dark; sb-abcd-auth-token=${session}`)).toBe(SUB);
  });

  it("나뉜 쿠키도 이어 붙여 읽는다", () => {
    const half = Math.floor(session.length / 2);
    expect(sessionUserId(`sb-abcd-auth-token.0=${session.slice(0, half)}; sb-abcd-auth-token.1=${session.slice(half)}`)).toBe(SUB);
  });

  it("쿠키가 없거나 깨졌으면 null", () => {
    expect(sessionUserId(null)).toBeNull();
    expect(sessionUserId("other=1")).toBeNull();
    expect(sessionUserId("sb-abcd-auth-token=base64-!!!")).toBeNull();
  });
});
