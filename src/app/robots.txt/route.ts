import { buildRobotsTxt } from "@/lib/security/robots-txt";

// 내용이 고정이라 빌드 때 한 번 만들어 둔다 (내용은 lib/security/robots-txt.ts).
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(buildRobotsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
