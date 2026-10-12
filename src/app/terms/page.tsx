import type { Metadata } from "next";

export const metadata: Metadata = { title: "이용약관" };

// 초안은 정책 문서(Claude Docs)에 있다. 법률 검토를 마친 뒤 이 자리에 전문을 싣는다.
export default function Page() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 pb-16 md:px-6">
      <h1 className="text-2xl font-bold">이용약관</h1>
      <p className="mt-4 leading-relaxed text-quiet">
        정식 이용약관은 서비스를 열기 전에 이곳에 게시됩니다. 지금은 개발 중인 시험 운영 단계예요.
      </p>
    </div>
  );
}
