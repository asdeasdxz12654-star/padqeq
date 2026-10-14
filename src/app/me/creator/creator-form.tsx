"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { REGIONS } from "@/lib/events/calendar";
import { CREDIT_ROLE_LABEL } from "@/lib/photos/credit-input";
import { removeCreatorProfile, saveCreatorProfile } from "./actions";

const ROLES = ["cosplayer", "photographer", "model", "retoucher"] as const;
type Role = (typeof ROLES)[number];

export type CreatorDraft = {
  listed: boolean;
  roles: Role[];
  region: string;
  activeSince: string;
  works: string;
  castingOpen: boolean;
};

const input = "min-h-11 rounded-xl border border-line bg-bg px-3 text-base";

export function CreatorForm({ initial, exists, adult, currentYear }: { initial: CreatorDraft; exists: boolean; adult: boolean; currentYear: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof CreatorDraft>(key: K, value: CreatorDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await saveCreatorProfile(draft);
          setMessage(result.ok ? { ok: true, text: draft.listed ? "저장했어요. 디렉토리에 보여요." : "저장했어요. 디렉토리에는 보이지 않아요." } : { ok: false, text: result.error });
          router.refresh();
        });
      }}
    >
      <fieldset>
        <legend className="mb-1.5 text-sm">역할 (하나 이상)</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <label key={r} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-text has-checked:bg-text has-checked:text-bg">
              <input
                type="checkbox"
                checked={draft.roles.includes(r)}
                onChange={(e) => set("roles", e.target.checked ? [...draft.roles, r] : draft.roles.filter((x) => x !== r))}
                className="sr-only"
              />
              {CREDIT_ROLE_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          지역 <span className="text-xs text-quiet">(선택)</span>
          <select value={draft.region} onChange={(e) => set("region", e.target.value)} className={input}>
            <option value="">밝히지 않음</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          활동 시작 연도 <span className="text-xs text-quiet">(선택)</span>
          <input type="number" inputMode="numeric" min={1990} max={currentYear} value={draft.activeSince} onChange={(e) => set("activeSince", e.target.value)} className={input} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        주로 하는 작품 <span className="text-xs text-quiet">(선택 · 100자)</span>
        <input value={draft.works} onChange={(e) => set("works", e.target.value)} maxLength={100} placeholder="예: 원신 · 블루 아카이브" className={input} />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={draft.castingOpen} disabled={!adult} onChange={(e) => set("castingOpen", e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          섭외 가능 표시
          <span className="block text-xs text-quiet">
            {adult ? "디렉토리에서 '섭외 가능만'으로 찾을 수 있어요." : "만 19세 이상 확인을 한 회원만 켤 수 있어요 (섭외 게시판에서 확인)."}
          </span>
        </span>
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={draft.listed} onChange={(e) => set("listed", e.target.checked)} className="size-4 accent-[var(--accent)]" />
        디렉토리에 보이기
      </label>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-400" : "text-red-300"}`}>
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!draft.roles.length || pending} className="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
          저장
        </button>
        {exists && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("크리에이터 정보를 지울까요? 디렉토리에서 빠져요.")) return;
              startTransition(async () => {
                const result = await removeCreatorProfile();
                setMessage(result.ok ? { ok: true, text: "지웠어요." } : { ok: false, text: result.error });
                router.refresh();
              });
            }}
            className="min-h-11 rounded-xl border border-line px-4 text-sm"
          >
            지우기
          </button>
        )}
      </div>
    </form>
  );
}
