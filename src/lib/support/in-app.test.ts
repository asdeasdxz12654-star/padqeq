import { describe, expect, it } from "vitest";
import { detectInAppBrowser, externalOpenUrl } from "./in-app";

const KAKAO_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const INSTA_ANDROID = "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Instagram 350.0";
const INSTA_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("인앱 브라우저", () => {
  it("앱 이름을 알아낸다", () => {
    expect(detectInAppBrowser(KAKAO_IOS)).toBe("카카오톡");
    expect(detectInAppBrowser(INSTA_ANDROID)).toBe("인스타그램");
    expect(detectInAppBrowser(SAFARI)).toBeNull();
  });

  it("기본 브라우저로 여는 주소를 만든다", () => {
    const url = "https://haedam.example/login?next=%2Fme";
    expect(externalOpenUrl(KAKAO_IOS, url)).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`);
    expect(externalOpenUrl(INSTA_ANDROID, url)).toBe("intent://haedam.example/login?next=%2Fme#Intent;scheme=https;end");
    expect(externalOpenUrl(INSTA_IOS, url)).toBeNull();
  });
});
