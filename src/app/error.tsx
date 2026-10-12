"use client";

import Link from "next/link";

// 오류 번호(digest)만 보여 주고 내부 메시지는 노출하지 않는다 (S-20)
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-bold">오류가 발생했어요</h1>
      <p className="mt-2 text-quiet">잠시 후 다시 시도해 주세요.</p>
      {error.digest && <p className="mt-1 text-sm text-quiet">오류 번호 {error.digest}</p>}
      <p className="mt-6 flex justify-center gap-4">
        <button type="button" onClick={reset} className="text-accent underline-offset-4 hover:underline">
          다시 시도
        </button>
        <Link href="/help" className="text-accent underline-offset-4 hover:underline">
          문의하기
        </Link>
      </p>
    </div>
  );
}
