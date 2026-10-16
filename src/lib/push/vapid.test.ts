import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { vapidAuthorization } from "./vapid";

describe("VAPID 서명", () => {
  // 테스트마다 새 키 (운영 키와 무관)
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
  const keys = { publicKey: point.toString("base64url"), privateKey: jwk.d!, subject: "mailto:ops@example.com" };

  it("푸시 서비스 출처 · 만료 · 연락처를 담고, 공개 키로 검증된다", async () => {
    const now = Date.parse("2026-10-15T00:00:00Z");
    const auth = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, now);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth)!;
    expect(match[4]).toBe(keys.publicKey);
    const claims = JSON.parse(Buffer.from(match[2]!, "base64url").toString());
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:ops@example.com" });
    const ok = verify("sha256", Buffer.from(`${match[1]}.${match[2]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(match[3]!, "base64url"));
    expect(ok).toBe(true);
  });
});
