import type { MetadataRoute } from "next";
import { AI_CRAWLERS } from "@/lib/security/ai-crawlers";

// AI 학습 · 수집 크롤러는 전부 거부. Cloudflare의 AI 봇 차단과 함께 쓴다.
// robots.txt는 권고일 뿐이라, 이름을 밝힌 크롤러는 worker.ts가 403으로 막고 숨긴 크롤러는 Cloudflare가 막는다.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...AI_CRAWLERS], disallow: "/" },
      // 일반 검색엔진은 공개 페이지만. 사진 파일과 개인 영역은 제외
      { userAgent: "*", allow: "/", disallow: ["/img/", "/me", "/upload", "/api/", "/login", "/welcome", "/auth/", "/admin", "/settings", "/notifications"] },
    ],
  };
}
