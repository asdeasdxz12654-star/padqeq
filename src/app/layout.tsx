import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { connection } from "next/server";
import { PhotoGuard } from "@/components/photo-guard";
import { RestrictionBanner } from "@/components/restriction-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteNotice } from "@/components/site-notice";
import { SiteHeader } from "@/components/site-header";
import { SearchShortcut } from "@/components/search-box";
import { TabBar } from "@/components/tab-bar";
import { UploadFab } from "@/components/upload-fab";
import { NavProgress } from "@/components/nav-progress";
import { PhotoDevelop } from "@/components/photo-develop";
import { SwRegister } from "@/components/sw-register";
import { OG_IMAGES } from "@/lib/og";
import "./globals.css";

// 빌드 때 받아 같은 출처에서 서빙한다 (CSP font-src 'self')
const plexKr = IBM_Plex_Sans_KR({
  // 굵기는 보통 · 굵게 두 가지만 (글꼴 파일 수 · 용량을 줄인다. 500 · 600은 가까운 굵기로 보인다)
  weight: ["400", "700"],
  variable: "--font-plex-kr",
  preload: false,
  // 늦게 온 글꼴로 화면을 다시 그리지 않는다: 첫 방문에 바로 준비되지 않으면 기기 글꼴로 보이고, 다음 방문부터 (저장된) Plex로
  display: "optional",
});

export const metadata: Metadata = {
  title: { default: "해담", template: "%s · 해담" },
  description: "해마다, 잊지 않도록 — 코스프레 · 모델 · 풍경 · 여행 사진을 해마다 담아 두는 추억 갤러리",
  applicationName: "해담",
  // 공유 카드(카카오톡 · SNS 미리보기)의 절대 주소 기준
  metadataBase: new URL("https://www.memories.haedam.app"),
  openGraph: {
    siteName: "해담",
    locale: "ko_KR",
    type: "website",
    images: OG_IMAGES,
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
  // 홈 화면에 추가했을 때 (아이폰). 밝은 바탕이라 상태 표시줄은 기본(검정 글자)으로.
  appleWebApp: { capable: true, title: "해담", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default async function RootLayout({ children, modal }: LayoutProps<"/">) {
  // CSP nonce는 요청마다 새로 붙어야 하므로 모든 페이지를 요청 시점에 렌더링한다.
  // (정적 페이지에는 nonce가 없어 스크립트가 차단됨)
  await connection();
  const saved = (await cookies()).get("theme")?.value;
  // 기본은 라이트. 다크 · 기기 설정은 설정 화면에서 고른 사람만
  const theme = saved === "dark" || saved === "system" ? saved : "light";

  return (
    <html lang="ko" data-theme={theme} className={`${plexKr.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
        >
          본문으로 건너뛰기
        </a>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <SiteHeader />
        <SiteNotice />
        <RestrictionBanner />
        <main id="main" className="flex-1 pb-20 md:pb-0">
          {children}
          <SiteFooter />
        </main>
        {/* 피드에서 연 게시물 (S-07 ①, app/@modal) */}
        {modal}
        <TabBar />
        <UploadFab />
        <PhotoGuard />
        <PhotoDevelop />
        <SwRegister />
        <SearchShortcut />
      </body>
    </html>
  );
}
