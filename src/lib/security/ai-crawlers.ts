// AI 학습 · 수집 크롤러 (robots.txt 거부 목록 + worker.ts 직접 차단에 같이 쓴다)
// robots.txt는 권고일 뿐이라, 이름을 밝히고 오는 크롤러는 worker.ts에서 403으로 돌려보낸다.
// 이름을 숨기는 크롤러는 Cloudflare AI 봇 차단 · Bot Fight Mode가 맡는다.
export const AI_CRAWLERS = [
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
  "ImagesiftBot",
  "PetalBot",
  "YouBot",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "FacebookBot",
  "DuckAssistBot",
  "MistralAI-User",
  "Kangaroo Bot",
] as const;

const PATTERN = new RegExp(AI_CRAWLERS.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

/** User-Agent가 알려진 AI 크롤러인지 */
export function isAiCrawler(userAgent: string | null): boolean {
  return userAgent !== null && PATTERN.test(userAgent);
}
