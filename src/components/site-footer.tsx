import Link from "next/link";

/** 모든 화면 아래 (S-20 ⑤). 개인정보처리방침은 굵게 (법적 요구). */
export function SiteFooter() {
  return (
    <footer className="mx-auto mt-16 max-w-[1440px] border-t border-line px-4 pt-6 pb-8 text-xs text-quiet md:px-6">
      <nav aria-label="사이트 안내" className="-my-2 flex flex-wrap gap-x-4">
        <Link href="/help" className="inline-flex min-h-10 items-center hover:text-text">
          고객센터
        </Link>
        <Link href="/help?tab=faq" className="inline-flex min-h-10 items-center hover:text-text">
          자주 묻는 질문
        </Link>
        <Link href="/terms" className="inline-flex min-h-10 items-center hover:text-text">
          이용약관
        </Link>
        <Link href="/privacy" className="inline-flex min-h-10 items-center font-semibold text-text hover:underline">
          개인정보처리방침
        </Link>
      </nav>
      <p className="mt-2">© 해담 · 사진의 무단 전재 · 재배포 및 AI 학습 이용을 금지합니다.</p>
    </footer>
  );
}
