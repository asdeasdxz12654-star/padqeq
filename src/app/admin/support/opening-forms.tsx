"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UPLOAD_STAGE_LABEL, type UploadStage } from "@/lib/support/labels";
import { addBannedWord, createInvite, removeBannedWord, revokeInvite, setUploadStage } from "./opening-actions";
import { KST } from "@/lib/format/kst";

const input = "min-h-11 rounded-xl border border-line bg-bg px-3 text-base";
const dateFormat = KST.date;

/** 단계를 바꾸기 전 확인할 것 (A-05 ① 전환 전 체크리스트) */
const CHECKLIST: Record<UploadStage, string[]> = {
  solo: ["회원이 올린 글은 그대로 남아요. 새 업로드만 막혀요."],
  invite: ["신고 · 소명 대기열을 매일 볼 수 있나요?", "금칙어 목록을 넣어 두었나요?", "초대 코드를 만들어 보낼 사람을 정했나요?"],
  open: [
    "가입 봇 방지(Turnstile)가 켜져 있나요?",
    "신고 처리 목표(최우선 24시간 · 일반 72시간)를 지킬 수 있나요?",
    "약관 · 개인정보처리방침 법률 검토를 마쳤나요?",
    "R2 · Supabase 무료 한도를 확인했나요?",
  ],
};

function useRun() {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { ok: true, text: done } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  return { run, message, pending };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`}>
      {message.text}
    </p>
  );
}

export function StageForm({ current }: { current: UploadStage }) {
  const [stage, setStage] = useState<UploadStage>(current);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const { run, message, pending } = useRun();
  const list = CHECKLIST[stage];
  const ready = stage !== current && note.trim() && list.every((c) => checked[c]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) run(() => setUploadStage(stage, note), `${UPLOAD_STAGE_LABEL[stage].title} 단계로 바꿨어요.`);
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold">운영 단계 · 지금: {UPLOAD_STAGE_LABEL[current].title}</legend>
        {(Object.keys(UPLOAD_STAGE_LABEL) as UploadStage[]).map((s) => (
          <label key={s} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-checked:border-accent">
            <input type="radio" name="stage" checked={stage === s} onChange={() => setStage(s)} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span className="text-sm">
              <span className="font-semibold">{UPLOAD_STAGE_LABEL[s].title}</span>
              <span className="block text-xs text-quiet">{UPLOAD_STAGE_LABEL[s].help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {stage !== current && (
        <>
          <fieldset className="flex flex-col gap-1.5 rounded-xl bg-slot p-3 text-sm">
            <legend className="sr-only">전환 전 확인</legend>
            {list.map((c) => (
              <label key={c} className="flex items-start gap-2">
                <input type="checkbox" checked={Boolean(checked[c])} onChange={(e) => setChecked((v) => ({ ...v, [c]: e.target.checked }))} className="mt-0.5 size-4 accent-[var(--accent)]" />
                {c}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm">
            바꾸는 이유 <span className="text-xs text-quiet">(필수 · 감사 로그)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={input} />
          </label>
        </>
      )}
      <Message message={message} />
      <button type="submit" disabled={!ready || pending} className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
        단계 바꾸기
      </button>
    </form>
  );
}

export type InviteRow = { code: string; note: string; max_uses: number; used_count: number; expires_at: string; revoked_at: string | null };

export function InviteCodes({ invites, stage }: { invites: InviteRow[]; stage: UploadStage }) {
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(14);
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const { run, message, pending } = useRun();

  return (
    <div className="flex flex-col gap-3">
      {stage !== "invite" && <p className="text-xs text-warn">초대 코드는 &lsquo;초대 회원&rsquo; 단계에서만 쓸 수 있어요. 미리 만들어 둘 수는 있어요.</p>}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await createInvite({ maxUses, days, note });
            if (result.ok) setCreated(result.code);
            return result;
          }, "초대 코드를 만들었어요.");
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          사용 횟수
          <input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className={`${input} w-24`} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          기한(일)
          <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} w-24`} />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs">
          메모 (누구에게 · 선택)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} className={input} />
        </label>
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">
          만들기
        </button>
      </form>
      {created && (
        <p className="rounded-xl border border-accent p-3 text-center">
          <span className="block text-xs text-quiet">새 초대 코드 (회원에게 전해 주세요)</span>
          <span className="font-mono text-2xl tracking-widest">
            {created.slice(0, 4)}-{created.slice(4)}
          </span>
        </p>
      )}
      <Message message={message} />
      {invites.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line text-sm">
          {invites.map((i) => {
            const dead = i.revoked_at !== null || Date.parse(i.expires_at) < Date.parse(new Date().toISOString()) || i.used_count >= i.max_uses;
            return (
              <li key={i.code} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${dead ? "opacity-50" : ""}`}>
                <span className="font-mono">
                  {i.code.slice(0, 4)}-{i.code.slice(4)}
                </span>
                <span className="text-xs text-quiet">
                  {i.used_count}/{i.max_uses}회 · {dateFormat.format(new Date(i.expires_at))}까지{i.revoked_at ? " · 막음" : ""}
                  {i.note && ` · ${i.note}`}
                </span>
                {!dead && (
                  <button type="button" disabled={pending} onClick={() => run(() => revokeInvite(i.code), "코드를 막았어요.")} className="ml-auto text-xs text-danger underline">
                    막기
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function BannedWords({ words }: { words: string[] }) {
  const [word, setWord] = useState("");
  const { run, message, pending } = useRun();
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await addBannedWord(word);
            if (result.ok) setWord("");
            return result;
          }, "넣었어요.");
        }}
      >
        <label className="sr-only" htmlFor="banned-word">
          금칙어
        </label>
        <input id="banned-word" value={word} onChange={(e) => setWord(e.target.value)} maxLength={40} placeholder="막을 말 (띄어쓰기 · 기호는 무시하고 비교해요)" className={`${input} min-w-0 flex-1`} />
        <button type="submit" disabled={!word.trim() || pending} className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm">
          넣기
        </button>
      </form>
      <Message message={message} />
      {words.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {words.map((w) => (
            <li key={w} className="flex items-center gap-1 rounded-full border border-line py-1 pr-1 pl-3">
              {w}
              <button type="button" aria-label={`${w} 빼기`} disabled={pending} onClick={() => run(() => removeBannedWord(w), "뺐어요.")} className="flex size-7 items-center justify-center rounded-full text-quiet hover:text-text">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
