"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelDeletion, requestDeletion } from "./actions";
import { KST } from "@/lib/format/kst";

const dateFormat = KST.dateLong;

/** 계정 삭제 (S-14 ⑤): 요청 → 30일 유예 → 영구 삭제. 유예 중에는 취소할 수 있다. */
export function DeletionPanel({ handle, requestedAt }: { handle: string; requestedAt: string | null }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.ok) {
        setConfirm("");
        router.refresh();
      } else setError(result.error ?? "처리하지 못했어요.");
    });

  if (requestedAt) {
    const purgeOn = new Date(Date.parse(requestedAt) + 30 * 86_400_000);
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-danger-line bg-danger-soft p-4 text-sm">
        <p className="font-semibold text-danger">계정 삭제가 예약돼 있어요</p>
        <p className="leading-relaxed text-danger">
          {dateFormat.format(purgeOn)} 이후 계정과 게시물이 영구 삭제돼요. 그 전까지 내 프로필과 게시물은 다른 사람에게 보이지 않아요.
        </p>
        {error && <p className="text-danger">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(cancelDeletion)}
          className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "취소하는 중…" : "삭제 취소"}
        </button>
      </div>
    );
  }

  const matches = confirm.trim().replace(/^@/, "").toLowerCase() === handle;

  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => requestDeletion(confirm));
      }}
    >
      <ul className="list-disc space-y-1 pl-5 leading-relaxed text-quiet">
        <li>요청한 날부터 30일 동안 내 프로필과 게시물이 다른 사람에게 보이지 않아요.</li>
        <li>30일 안에 다시 로그인해서 취소하면 그대로 돌아와요.</li>
        <li>30일이 지나면 계정 · 게시물 · 사진이 영구 삭제되고 되돌릴 수 없어요.</li>
        <li>다른 사람 게시물에 있는 내 크레딧은 &lsquo;탈퇴한 회원&rsquo;으로 바뀌어요.</li>
        <li>
          삭제 전에 &lsquo;내 데이터 내려받기&rsquo;로 기록을 보관해 두세요. 원본 사진 파일은 서버에 없으니 따로 보관하신 것을 확인해 주세요.
        </li>
      </ul>
      <label className="flex flex-col gap-1.5">
        <span>
          확인을 위해 내 핸들 <strong>@{handle}</strong>을 입력하세요
        </span>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-danger-line"
        />
      </label>
      {error && <p className="text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending || !matches}
        className="min-h-11 self-start rounded-xl border border-danger-line px-5 font-semibold text-danger disabled:opacity-40"
      >
        {pending ? "요청하는 중…" : "계정 삭제 요청"}
      </button>
    </form>
  );
}
