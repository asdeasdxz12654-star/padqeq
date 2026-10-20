"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setBlock, setMessageReceive } from "@/app/me/messages/actions";
import { profileHref } from "@/lib/profiles/profile-href";

type Receive = "everyone" | "following" | "none";
const OPTIONS: { value: Receive; label: string; help: string }[] = [
  { value: "everyone", label: "모두", help: "내가 팔로우하지 않는 사람의 메시지는 '메시지 요청'으로 와요." },
  { value: "following", label: "내가 팔로우한 사람만", help: "그 밖의 사람은 새 대화를 시작할 수 없어요." },
  { value: "none", label: "받지 않음", help: "새 대화를 받지 않아요. 이미 있는 대화는 그대로예요." },
];

export function MessageSettings({ receive, blocked }: { receive: Receive; blocked: { id: string; handle: string }[] }) {
  const router = useRouter();
  const [value, setValue] = useState<Receive>(receive);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm">메시지 받기</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-checked:border-accent">
            <input
              type="radio"
              name="receive"
              checked={value === o.value}
              disabled={pending}
              onChange={() => {
                setValue(o.value);
                startTransition(async () => {
                  const result = await setMessageReceive(o.value);
                  setMessage(result.ok ? "저장했어요." : result.error);
                });
              }}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className="text-sm">
              <span className="font-semibold">{o.label}</span>
              <span className="block text-xs text-quiet">{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <h3 className="mb-2 text-sm">차단한 회원 {blocked.length}</h3>
        {blocked.length === 0 ? (
          <p className="text-xs text-quiet">차단한 회원이 없어요. 대화 화면에서 차단할 수 있어요.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={profileHref(b.handle)} className="hover:underline">
                  @{b.handle}
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await setBlock(b.id, false);
                      setMessage(result.ok ? `@${b.handle} 차단을 풀었어요.` : result.error);
                      router.refresh();
                    })
                  }
                  className="min-h-9 rounded-full border border-line px-3 text-xs"
                >
                  차단 풀기
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-quiet">
          {message}
        </p>
      )}
    </div>
  );
}
