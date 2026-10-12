import { describe, expect, it } from "vitest";
import { safeNextPath, withNext } from "./next-path";

describe("safeNextPath", () => {
  it("사이트 안 경로는 그대로", () => {
    expect(safeNextPath("/me")).toBe("/me");
    expect(safeNextPath("/?year=2025")).toBe("/?year=2025");
    expect(safeNextPath("/p/abc#c1")).toBe("/p/abc#c1");
  });

  it("외부로 나가는 값은 홈으로", () => {
    for (const raw of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "evil.com",
      "javascript:alert(1)",
      "/\nevil",
      "",
      null,
      ["/me"],
      `/${"a".repeat(600)}`,
    ]) {
      expect(safeNextPath(raw)).toBe("/");
    }
  });

  it("로그인 흐름으로 되돌아가는 경로는 막는다", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/welcome?next=/me")).toBe("/");
    expect(safeNextPath("/auth/callback")).toBe("/");
    // 이름만 비슷한 경로는 허용
    expect(safeNextPath("/login-help")).toBe("/login-help");
  });

  it("경로 정규화 뒤에도 검사한다", () => {
    expect(safeNextPath("/x/../login")).toBe("/");
  });
});

describe("withNext", () => {
  it("홈이면 붙이지 않는다", () => {
    expect(withNext("/login", "/")).toBe("/login");
    expect(withNext("/welcome", "/me?tab=1")).toBe("/welcome?next=%2Fme%3Ftab%3D1");
  });
});
