// robots.txt — 접근 의사(크롤링해도 되는가)와 용도 의사(가져간 뒤 무엇에 써도 되는가)를 같이 밝힌다.
// Next의 MetadataRoute.Robots는 Content-Signal 줄을 표현하지 못해 직접 만든다.
//  · 접근: 이름 밝힌 AI 학습 · 수집 크롤러는 전부 거부 (실제 차단은 worker.ts의 403)
//  · 용도: 허용한 크롤러(검색엔진)에게도 학습 · AI 답변 활용은 거부
// robots.txt는 권고일 뿐이라, 이름을 숨긴 크롤러는 Cloudflare의 AI bot policies가 맡는다.
import { AI_CRAWLERS } from "./ai-crawlers";

/** 일반 검색엔진에도 색인을 맡기지 않는 곳 (사진 파일 · 개인 영역 · 인증 화면) */
const PRIVATE_PATHS = ["/img/", "/me", "/upload", "/api/", "/login", "/welcome", "/auth/", "/admin", "/settings", "/notifications"];

// Content Signals Policy(contentsignals.org)가 정한 문구 그대로.
// 권리 유보의 근거가 되는 문장이라 번역하거나 줄이지 않는다.
const CONTENT_SIGNALS_NOTICE = `# As a condition of accessing this website, you agree to abide by the following content signals:
# (a) If a content-signal = yes, you may collect content for the corresponding use.
# (b) If a content-signal = no, you may not collect content for the corresponding use.
# (c) If the website operator does not include a content signal for a corresponding use, the website operator neither grants nor restricts permission via content signal with respect to the corresponding use.
#
# The content signals and their meanings are:
# search: building a search index and providing search results (e.g., returning hyperlinks and short excerpts from your website's contents). Search does not include providing AI-generated search summaries.
# ai-input: inputting content into one or more AI models (e.g., retrieval augmented generation, grounding, or other real-time taking of content for generative AI search answers).
# ai-train: training or fine-tuning AI models.
#
# ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790 ON COPYRIGHT AND RELATED RIGHTS IN THE DIGITAL SINGLE MARKET.`;

// 크롤러는 자기에게 맞는 그룹 하나만 읽으므로, 용도 의사는 그룹마다 따로 적는다.
const AI_SIGNAL = "Content-Signal: search=no, ai-train=no, ai-input=no";
const SEARCH_SIGNAL = "Content-Signal: search=yes, ai-train=no, ai-input=no";

export function buildRobotsTxt(): string {
  const aiGroup = [...AI_CRAWLERS.map((name) => `User-Agent: ${name}`), AI_SIGNAL, "Disallow: /"];
  const searchGroup = ["User-Agent: *", SEARCH_SIGNAL, "Allow: /", ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`)];
  return [CONTENT_SIGNALS_NOTICE, "", aiGroup.join("\n"), "", searchGroup.join("\n"), ""].join("\n");
}
