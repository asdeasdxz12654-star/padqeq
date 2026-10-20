import { describe, expect, it } from "vitest";
import { socialFromUrl, socialUrl } from "./social-id";

describe("인스타그램 · X 아이디", () => {
  it("아이디 → 주소 (@는 떼고, 모양이 아니면 null)", () => {
    expect(socialUrl("instagram", "@moon.cos_")).toBe("https://www.instagram.com/moon.cos_");
    expect(socialUrl("x", "moon_cos")).toBe("https://x.com/moon_cos");
    expect(socialUrl("x", "moon.cos")).toBeNull();
    expect(socialUrl("instagram", "a b")).toBeNull();
    expect(socialUrl("instagram", "")).toBeNull();
  });

  it("주소 → 아이디 (트위터 주소도 X로, 다른 주소는 null)", () => {
    expect(socialFromUrl("https://www.instagram.com/moon.cos_")).toEqual({ kind: "instagram", id: "moon.cos_" });
    expect(socialFromUrl("https://twitter.com/moon_cos")).toEqual({ kind: "x", id: "moon_cos" });
    expect(socialFromUrl("https://x.com/moon_cos/status/1")).toBeNull();
    expect(socialFromUrl("https://example.com/moon")).toBeNull();
    expect(socialFromUrl(null)).toBeNull();
  });
});
