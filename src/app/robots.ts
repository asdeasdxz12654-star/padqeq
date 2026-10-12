import type { MetadataRoute } from "next";

// AI 학습 · 수집 크롤러는 전부 거부. Cloudflare의 AI 봇 차단과 함께 쓴다.
// robots.txt는 권고일 뿐이라 실제 차단은 WAF · Bot Fight Mode가 맡는다.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Meta-ExternalAgent",
  "meta-externalfetcher",
  "Amazonbot",
  "cohere-ai",
  "Diffbot",
  "img2dataset",
  "omgili",
  "Timpibot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: "/" },
      // 일반 검색엔진은 공개 페이지만. 사진 파일과 개인 영역은 제외
      { userAgent: "*", allow: "/", disallow: ["/img/", "/me", "/upload", "/api/", "/login", "/welcome", "/auth/"] },
    ],
  };
}
