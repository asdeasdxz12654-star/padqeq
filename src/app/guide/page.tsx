import type { Metadata } from "next";
import Link from "next/link";
import { GUIDE } from "@/lib/support/guide";

// 이용 가이드. 가입 직후(/welcome/intro) · 푸터 · 업로드 막힘 화면에서 들어온다.
// FAQ처럼 접지 않고 펼친 채로 둔다: 위에서 아래로 읽는 글이고, /guide#credits 로 바로 열려야 한다.

export const metadata: Metadata = {
  title: "이용 가이드",
  description: "해담을 처음 쓰는 분을 위한 안내 — 사진을 담아 두는 법, 크레딧, 태그로 찾기.",
};

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 pb-16 md:px-6">
      <h1 className="text-2xl font-bold">이용 가이드</h1>
      <p className="mt-2 text-sm leading-relaxed text-quiet">해담을 처음 쓰신다면 여기부터 보세요. 1분이면 충분해요.</p>

      <div className="mt-8 flex flex-col gap-8">
        {GUIDE.map((item) => (
          <section key={item.id} id={item.id} aria-labelledby={`${item.id}-heading`} className="scroll-mt-20">
            <h2 id={`${item.id}-heading`} className="font-semibold">
              {item.q}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-quiet">{item.a}</p>
            {item.links && (
              <nav aria-label={`${item.q} 바로가기`} className="-mb-2 mt-2 flex flex-wrap gap-x-4">
                {item.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex min-h-10 items-center text-sm font-medium text-text underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}
          </section>
        ))}
      </div>

      <p className="mt-12 text-sm leading-relaxed text-quiet">
        찾는 내용이 없으면{" "}
        <Link href="/help?tab=faq" className="underline underline-offset-2">
          자주 묻는 질문
        </Link>
        을 보시거나{" "}
        <Link href="/help?tab=inquiry" className="underline underline-offset-2">
          1:1 문의
        </Link>
        를 남겨 주세요.
      </p>
    </div>
  );
}
