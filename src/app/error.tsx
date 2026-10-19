"use client";

import Link from "next/link";
import { useEffect } from "react";
import { LineArt } from "@/components/line-art";

// 오류 번호(digest)만 보여 주고 내부 메시지는 노출하지 않는다 (S-20)
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // 오류 번호와 화면 주소만 운영자 대시보드로 (회원이 문의하지 않아도 알 수 있게)
  useEffect(() => {
    if (!error.digest) return;
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest: error.digest, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [error.digest]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <LineArt kind="error" className="mb-4" />
      <h1 className="text-xl font-bold">오류가 발생했어요</h1>
      <p className="mt-2 text-quiet">잠시 후 다시 시도해 주세요.</p>
      {error.digest && <p className="mt-1 text-sm text-quiet">오류 번호 {error.digest}</p>}
      <p className="mt-6 flex justify-center gap-4">
        <button type="button" onClick={reset} className="text-accent underline-offset-4 hover:underline">
          다시 시도
        </button>
        <Link
          href={error.digest ? `/help?tab=inquiry&ref=${encodeURIComponent(error.digest)}` : "/help?tab=inquiry"}
          className="text-accent underline-offset-4 hover:underline"
        >
          문의하기
        </Link>
      </p>
    </div>
  );
}
