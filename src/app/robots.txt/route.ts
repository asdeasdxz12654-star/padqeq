import { buildRobotsTxt } from "@/lib/security/robots-txt";

// 내용은 lib/security/robots-txt.ts. 문자열을 잇는 일뿐이라 요청마다 만든다
// (이 앱은 증분 캐시를 쓰지 않는다 — open-next.config.ts). 재방문 비용은 Cache-Control로 줄인다.
export function GET(): Response {
  return new Response(buildRobotsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
