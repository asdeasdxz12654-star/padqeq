"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ASSIGNABLE_ROLES, ROLE_LABEL } from "@/lib/auth/roles";
import { setRole } from "../actions";

const HELP: Record<(typeof ASSIGNABLE_ROLES)[number], string> = {
  member: "운영 화면을 쓸 수 없어요.",
  moderator: "신고 처리 · 불법 촬영물 격리 · 일반 회원 경고만 할 수 있어요. 2단계 인증이 필요해요.",
};

/** 역할 지정 (최고 관리자만). 운영 도우미가 /admin에 들어오려면 Cloudflare Access 허용 목록에도 이메일을 넣어야 한다. */
export function RoleForm({ memberId, current }: { memberId: string; current: "member" | "moderator" }) {
  const router = useRouter();
  const [role, setRoleValue] = useState(current);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = role !== current;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setRole({ memberId, role, note });
          if (!result.ok) {
            setError(result.error ?? "역할을 바꾸지 못했어요.");
            return;
          }
          setNote("");
          router.refresh();
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">역할</legend>
        {ASSIGNABLE_ROLES.map((r) => (
          <label key={r} className="flex min-h-11 items-start gap-2 rounded-xl border border-line p-3 text-sm has-checked:border-accent">
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRoleValue(r)} className="mt-1" />
            <span>
              <span className="font-semibold">{ROLE_LABEL[r]}</span>
              {r === current && <span className="ml-1 text-xs text-quiet">(지금)</span>}
              <span className="block text-xs text-quiet">{HELP[r]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {changed && (
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="role-note">
            바꾸는 이유
          </label>
          <input
            id="role-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="바꾸는 이유 (감사 로그에 남아요)"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
          />
          <button
            type="submit"
            disabled={pending || !note.trim()}
            className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {pending ? "바꾸는 중…" : "바꾸기"}
          </button>
        </div>
      )}
      {changed && role === "moderator" && (
        <p className="text-xs text-quiet">운영 화면은 Cloudflare Access로도 막혀 있어요. 이 회원의 로그인 이메일을 Access 허용 목록에 넣어 주세요.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
