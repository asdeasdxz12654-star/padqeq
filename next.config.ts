import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// CSP(nonce)는 요청마다 달라야 하므로 worker.ts에서 붙인다.
// 여기에는 요청과 무관한 고정 보안 헤더만 둔다.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // 교차 출처 격리: RAW 현상(LibRaw 멀티스레드 WebAssembly)에 필요한 SharedArrayBuffer를 쓰기 위해.
  // 해담은 외부 이미지 · iframe을 쓰지 않으므로 같은 출처 리소스만으로 동작한다.
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // 검색엔진은 허용하되 AI 학습·이미지 색인은 거부 (robots.ts와 함께)
  { key: "X-Robots-Tag", value: "noai, noimageai, noimageindex" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  // 사진은 자체 이미지 게이트(/img)가 서빙한다. Next 이미지 최적화는 쓰지 않음.
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // 프로필 주소 /@handle → 실제 화면 /u/handle (폴더 이름의 @는 병렬 라우트용이라 쓸 수 없다)
  async rewrites() {
    return [{ source: "/@:handle", destination: "/u/:handle" }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

// `next dev`에서 Cloudflare 바인딩(R2 등)을 쓰려면 CF_DEV=1로 실행.
// 로컬 Workers 런타임(workerd)이 필요해서 기본은 끈다.
if (process.env.CF_DEV === "1") void initOpenNextCloudflareForDev();
