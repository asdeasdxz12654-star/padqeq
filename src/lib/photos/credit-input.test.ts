import { describe, expect, it } from "vitest";
import { cleanExternalUrl, creditSchema } from "./credit-input";

describe("크레딧 입력", () => {
  it("외부 링크는 https로 맞추고 이상한 주소는 거부", () => {
    expect(cleanExternalUrl("instagram.com/moon_cos")).toBe("https://instagram.com/moon_cos");
    expect(cleanExternalUrl("http://x.com/a")).toBe("https://x.com/a");
    expect(cleanExternalUrl("javascript:alert(1)")).toBeNull();
    expect(cleanExternalUrl("https://user:pw@evil.com")).toBeNull();
    expect(cleanExternalUrl("localhost")).toBeNull();
    expect(cleanExternalUrl("  ")).toBeNull();
  });

  it("회원 크레딧은 핸들 형식, 외부 크레딧은 이름 필수", () => {
    expect(creditSchema.safeParse({ kind: "member", role: "photographer", handle: "wolf_1" }).success).toBe(true);
    expect(creditSchema.safeParse({ kind: "member", role: "photographer", handle: "Wolf" }).success).toBe(false);
    expect(creditSchema.safeParse({ kind: "external", role: "cosplayer", label: " " }).success).toBe(false);
    expect(creditSchema.parse({ kind: "external", role: "cosplayer", label: "달빛", url: "x.com/moon" })).toMatchObject({
      label: "달빛",
      url: "https://x.com/moon",
    });
    expect(creditSchema.safeParse({ kind: "external", role: "cosplayer", label: "달빛", url: "ftp://a" }).success).toBe(false);
  });
});
