import { describe, expect, it } from "vitest";
import { installMode } from "./install";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const KAKAO = `${ANDROID_CHROME} KAKAOTALK 10.8.0`;

describe("installMode", () => {
  it("이미 설치해 열었으면 안내하지 않는다", () => {
    expect(installMode(IPHONE_SAFARI, { standalone: true, canPrompt: false })).toBe("installed");
  });
  it("아이폰 Safari는 홈 화면에 추가, 다른 브라우저는 Safari로", () => {
    expect(installMode(IPHONE_SAFARI, { standalone: false, canPrompt: false })).toBe("ios-safari");
    expect(installMode(IPHONE_CHROME, { standalone: false, canPrompt: false })).toBe("ios-other");
  });
  it("크롬은 설치 창이 준비됐을 때만", () => {
    expect(installMode(ANDROID_CHROME, { standalone: false, canPrompt: true })).toBe("prompt");
    expect(installMode(ANDROID_CHROME, { standalone: false, canPrompt: false })).toBe("none");
  });
  it("앱 안 브라우저는 기본 브라우저로", () => {
    expect(installMode(KAKAO, { standalone: false, canPrompt: true })).toBe("in-app");
  });
});
