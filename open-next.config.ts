import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 모든 페이지가 요청마다 렌더링된다(CSP nonce · 열람자 워터마크).
// 그래서 증분 캐시는 쓰지 않는다.
export default defineCloudflareConfig({});
