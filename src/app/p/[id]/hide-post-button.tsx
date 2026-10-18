"use client";

import Link from "next/link";
import { confirmAction } from "@/lib/ui/confirm";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hidePost } from "./actions";

export function HidePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-4">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          // 지우는 것으로 오해하기 쉬운 자리라, 되돌릴 수 있다는 것을 분명히 적는다
          if (
            !(await confirmAction({
              title: "이 게시물을 숨길까요?",
              body: "다른 사람에게 보이지 않아요. 사진은 지워지지 않고, '다시 게시'로 언제든 되돌릴 수 있어요.",
              confirmLabel: "숨기기",
            }))
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await hidePost(postId);
            if (!result.ok) {
              setError(result.error ?? "숨기지 못했어요.");
              return;
            }
            router.refresh();
          });
        }}
        className="self-start rounded-full border border-line px-3 py-1.5 text-sm text-quiet hover:text-text disabled:opacity-50"
      >
        {pending ? "숨기는 중…" : "숨기기"}
      </button>
      {/* 영구 삭제는 회원이 직접 할 수 없다 (크레딧으로 묶인 사람과 신고 기록이 글에 걸려 있다) */}
      <p className="text-xs leading-relaxed text-quiet">
        숨겨도 사진은 그대로 있고, 다시 게시할 수 있어요. 아주 지우고 싶다면{" "}
        <Link href="/help?tab=inquiry" className="underline underline-offset-2">
          1:1 문의
        </Link>
        로 알려 주세요.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
