"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAction } from "@/lib/ui/confirm";
import { deleteMyPost } from "./actions";

/** 작가 메뉴 › 지우기. 30일 동안 '지운 글'에 두었다가 영구 삭제한다 (그 안에는 되살릴 수 있다). */
export function DeletePostButton({ postId, credited }: { postId: string; credited: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const ok = await confirmAction({
            title: "이 게시물을 지울까요?",
            body: `모두에게서 사라지고 30일 뒤 사진까지 영구 삭제돼요. 그 전에는 마이페이지 › 내 글 관리 › 지운 글에서 되살릴 수 있어요.${credited ? " 함께 크레딧된 분에게 지웠다는 알림이 가요." : ""}`,
            confirmLabel: "지우기",
            danger: true,
          });
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteMyPost(postId);
            if (!result.ok) {
              setError(result.error ?? "지우지 못했어요.");
              return;
            }
            router.push("/me/posts?tab=deleted");
          });
        }}
        className="self-start rounded-full border border-danger-line px-3 py-1.5 text-sm text-danger disabled:opacity-50"
      >
        {pending ? "지우는 중…" : "지우기"}
      </button>
      <p className="text-xs leading-relaxed text-quiet">
        지운 글은{" "}
        <Link href="/me/posts?tab=deleted" className="underline underline-offset-2">
          내 글 관리
        </Link>
        에서 30일 동안 되살릴 수 있어요.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
