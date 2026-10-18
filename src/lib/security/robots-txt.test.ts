import { describe, expect, it } from "vitest";
import { buildRobotsTxt } from "./robots-txt";

describe("buildRobotsTxt", () => {
  const txt = buildRobotsTxt();

  it("AI 학습 · 수집 크롤러를 거부한다", () => {
    expect(txt).toContain("User-Agent: GPTBot");
    expect(txt).toContain("User-Agent: ClaudeBot");
    expect(txt).toContain("User-Agent: Google-Extended");
  });

  it("일반 검색엔진에는 공개 페이지만 열고 사진 · 개인 영역은 닫는다", () => {
    expect(txt).toContain("User-Agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /img/");
    expect(txt).toContain("Disallow: /me");
    expect(txt).not.toContain("User-Agent: Googlebot");
  });

  it("그룹마다 용도 의사(Content Signals)를 밝힌다", () => {
    expect(txt).toContain("Content-Signal: search=yes, ai-train=no, ai-input=no");
    expect(txt).toContain("Content-Signal: search=no, ai-train=no, ai-input=no");
    expect(txt).toContain("ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790");
  });

  it("검색엔진 그룹이 AI 크롤러 그룹보다 뒤에 와서 좁은 규칙이 먼저 읽힌다", () => {
    expect(txt.indexOf("User-Agent: GPTBot")).toBeLessThan(txt.indexOf("User-Agent: *"));
  });
});
