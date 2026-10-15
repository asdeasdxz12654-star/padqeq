import type { MetadataRoute } from "next";

// 홈 화면에 추가 (웹앱). 주소창 없이 앱처럼 열리고, 상단 바 · 하단 탭은 기기의 안전 영역을 비켜 그린다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "해담 — 해마다, 잊지 않도록",
    short_name: "해담",
    description: "코스프레 · 모델 · 풍경 사진을 해마다 담아 두는 추억 갤러리",
    lang: "ko",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#111110",
    theme_color: "#111110",
    categories: ["photo", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
