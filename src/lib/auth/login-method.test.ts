import { describe, expect, it } from "vitest";
import { parseLoginMethod } from "./login-method";

describe("parseLoginMethod", () => {
  it("카카오 · Google · 직접 연결한 네이버", () => {
    expect(parseLoginMethod("kakao")).toBe("kakao");
    expect(parseLoginMethod("google")).toBe("google");
    expect(parseLoginMethod("custom:naver")).toBe("naver");
  });
  it("모르는 방법은 null", () => {
    expect(parseLoginMethod("naver")).toBeNull();
    expect(parseLoginMethod(undefined)).toBeNull();
  });
});
