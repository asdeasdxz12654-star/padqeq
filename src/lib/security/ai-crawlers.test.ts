import { describe, expect, it } from "vitest";
import { isAiCrawler } from "./ai-crawlers";

describe("isAiCrawler", () => {
  it("AI 크롤러를 알아본다 (대소문자 무관)", () => {
    expect(isAiCrawler("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot")).toBe(true);
    expect(isAiCrawler("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")).toBe(true);
    expect(isAiCrawler("ccbot/2.0 (https://commoncrawl.org/faq/)")).toBe(true);
  });

  it("브라우저 · 일반 검색엔진은 막지 않는다", () => {
    expect(isAiCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isAiCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(false);
    expect(isAiCrawler("Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)")).toBe(false);
    expect(isAiCrawler(null)).toBe(false);
  });
});
