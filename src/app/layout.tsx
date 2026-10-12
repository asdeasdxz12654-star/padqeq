import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import { connection } from "next/server";
import { PhotoGuard } from "@/components/photo-guard";
import { SiteHeader } from "@/components/site-header";
import { TabBar } from "@/components/tab-bar";
import "./globals.css";

// 빌드 때 받아 같은 출처에서 서빙한다 (CSP font-src 'self')
const plexKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-kr",
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "해담", template: "%s · 해담" },
  description: "해마다, 잊지 않도록 — 코스프레 · 모델 · 풍경 사진을 해마다 담아 두는 추억 갤러리",
  applicationName: "해담",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f3" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP nonce는 요청마다 새로 붙어야 하므로 모든 페이지를 요청 시점에 렌더링한다.
  // (정적 페이지에는 nonce가 없어 스크립트가 차단됨)
  await connection();

  return (
    <html lang="ko" data-theme="dark" className={`${plexKr.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
        >
          본문으로 건너뛰기
        </a>
        <SiteHeader />
        <main id="main" className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
        <TabBar />
        <PhotoGuard />
      </body>
    </html>
  );
}
