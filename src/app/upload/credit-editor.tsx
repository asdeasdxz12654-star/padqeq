"use client";

import { useEffect, useState } from "react";
import {
  CREDIT_ROLE_LABEL,
  CREDIT_ROLES,
  type CreditInput,
  type CreditRole,
  MAX_CREDITS_PER_POST,
} from "@/lib/photos/credit-input";
import { SOCIALS, SOCIAL_KINDS, type Social, socialFromUrl, socialUrl } from "@/lib/photos/social-id";
import { type MemberOption, searchMembers } from "./tag-actions";
import { TermTip } from "@/components/term-tip";

// 크레딧 편집 (A-02 ⑤ · S-08). 회원은 @핸들로 골라 승인 요청, 미가입자는 인스타그램 · X 아이디(또는 이름 · 링크)로 바로 표시.

/** status: 이미 저장된 크레딧의 상태 (편집 화면) */
export type CreditDraft = CreditInput & { key: string; displayName?: string; status?: "pending" | "approved" | "rejected" };

const STATUS_LABEL = { pending: "승인 대기", approved: "승인됨", rejected: "거절됨" } as const;

/** 서버로 보낼 값 (화면용 key · displayName 제외) */
export function toCreditInput(c: CreditDraft): CreditInput {
  return c.kind === "member"
    ? { kind: "member", role: c.role, handle: c.handle }
    : { kind: "external", role: c.role, label: c.label, url: c.url };
}

const inputClass = "min-h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent";

/** 같은 역할 · 같은 사람(회원 핸들 또는 미가입 이름)인지 */
const sameCredit = (a: CreditDraft, b: CreditDraft) =>
  a.role === b.role &&
  (a.kind === "member" && b.kind === "member"
    ? a.handle === b.handle
    : a.kind === "external" && b.kind === "external" && a.label === b.label);

export function CreditEditor({
  value,
  onChange,
  disabled,
  viewerHandle,
  collapsible = false,
}: {
  value: CreditDraft[];
  onChange(credits: CreditDraft[]): void;
  disabled: boolean;
  viewerHandle: string | null;
  /** 찾기 칸을 접어 두고 [+ 함께한 사람]을 눌렀을 때만 연다 (올리기 화면) */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  const [role, setRole] = useState<CreditRole>("photographer");
  const [mode, setMode] = useState<"member" | "external">("member");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; members: MemberOption[] } | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [via, setVia] = useState<Social | "link">("instagram");
  const [socialId, setSocialId] = useState("");
  const full = value.length >= MAX_CREDITS_PER_POST;

  useEffect(() => {
    const q = query.trim();
    if (mode !== "member" || !q) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const members = await searchMembers(q);
      if (!stale) setFound({ query: q, members });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, mode]);

  const add = (credit: CreditDraft) => {
    if (!full && !value.some((c) => sameCredit(c, credit))) onChange([...value, credit]);
    setQuery("");
    setFound(null);
    setLabel("");
    setUrl("");
  };

  const members = found && found.query === query.trim() ? found.members : [];
  const searched = query.trim() !== "" && found?.query === query.trim();

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">
        크레딧
        <TermTip term="credit" label="크레딧" />
        {value.length >= MAX_CREDITS_PER_POST - 2 && <span className="ml-1 text-xs font-normal text-quiet">{MAX_CREDITS_PER_POST - value.length}명 더</span>}
      </span>

      {value.length > 0 && (
        <ul className="flex flex-col gap-1">
          {value.map((c) => (
            <li key={c.key} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
              <span className="w-10 shrink-0 text-xs text-quiet">{CREDIT_ROLE_LABEL[c.role]}</span>
              {c.kind === "member" ? (
                <span>
                  @{c.handle}
                  {c.displayName && <span className="text-quiet"> · {c.displayName}</span>}
                  <span className="ml-2 text-xs text-quiet">{c.handle === viewerHandle ? "나" : c.status ? STATUS_LABEL[c.status] : "승인 요청 알림이 가요"}</span>
                </span>
              ) : (
                <span className="truncate">
                  {c.label}
                  {c.url && <span className="ml-2 text-xs text-quiet">{socialLabel(c.url) ?? c.url}</span>}
                  <span className="ml-2 text-xs text-quiet">미가입</span>
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  aria-label="크레딧 빼기"
                  onClick={() => onChange(value.filter((x) => x.key !== c.key))}
                  className="ml-auto flex size-7 items-center justify-center rounded-full hover:bg-slot"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && !full && !open && (
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-10 items-center self-start text-sm font-semibold text-accent">
          + 함께한 사람
        </button>
      )}

      {!disabled && !full && open && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={role} onChange={(e) => setRole(e.target.value as CreditRole)} className={inputClass} aria-label="역할">
              {CREDIT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {CREDIT_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-line p-0.5 text-xs">
              {(["member", "external"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className="rounded-md px-2.5 py-1.5 aria-pressed:bg-text aria-pressed:text-bg"
                >
                  {m === "member" ? "해담 회원" : "미가입"}
                </button>
              ))}
            </div>
            {viewerHandle && mode === "member" && (
              <button
                type="button"
                onClick={() => add({ key: crypto.randomUUID(), kind: "member", role, handle: viewerHandle })}
                className="text-xs text-accent underline underline-offset-2"
              >
                나 (@{viewerHandle})
              </button>
            )}
          </div>

          {mode === "member" ? (
            <div className="relative">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="@핸들 또는 이름" className={`${inputClass} w-full`} />
              {members.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-line bg-surface p-1 shadow-lg">
                  {members.map((m) => (
                    <li key={m.handle}>
                      <button
                        type="button"
                        onClick={() =>
                          add({ key: crypto.randomUUID(), kind: "member", role, handle: m.handle, displayName: m.displayName })
                        }
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slot"
                      >
                        @{m.handle} <span className="text-quiet">· {m.displayName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searched && members.length === 0 && (
                <p className="mt-1 text-xs text-quiet">회원을 찾지 못했어요. 가입하지 않은 분이면 &lsquo;미가입&rsquo;으로 적어 주세요.</p>
              )}
            </div>
          ) : (
            <ExternalFields
              via={via}
              setVia={setVia}
              socialId={socialId}
              setSocialId={setSocialId}
              label={label}
              setLabel={setLabel}
              url={url}
              setUrl={setUrl}
              onAdd={(credit) => {
                add({ key: crypto.randomUUID(), kind: "external", role, ...credit });
                setSocialId("");
                setLabel("");
                setUrl("");
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** 크레딧 목록에서 주소 대신 '인스타 @아이디' */
function socialLabel(url: string): string | null {
  const s = socialFromUrl(url);
  return s ? `${SOCIALS[s.kind].short} @${s.id}` : null;
}

/** 미가입: 인스타그램 · X 아이디만 적어도 되고(이름은 선택), 다른 곳은 이름 + 링크 */
function ExternalFields({
  via,
  setVia,
  socialId,
  setSocialId,
  label,
  setLabel,
  url,
  setUrl,
  onAdd,
}: {
  via: Social | "link";
  setVia(v: Social | "link"): void;
  socialId: string;
  setSocialId(v: string): void;
  label: string;
  setLabel(v: string): void;
  url: string;
  setUrl(v: string): void;
  onAdd(credit: { label: string; url: string }): void;
}) {
  const social = via === "link" ? null : via;
  const idUrl = social ? socialUrl(social, socialId) : null;
  const badId = social !== null && socialId.trim() !== "" && !idUrl;
  const name = label.trim() || (idUrl ? `@${socialId.trim().replace(/^@/, "")}` : "");
  const ready = social ? Boolean(idUrl) : Boolean(label.trim());
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={via} onChange={(e) => setVia(e.target.value as Social | "link")} aria-label="어디 아이디인지" className={`${inputClass} sm:w-36`}>
          {SOCIAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {SOCIALS[k].label}
            </option>
          ))}
          <option value="link">이름 · 링크</option>
        </select>
        {social ? (
          <input
            value={socialId}
            onChange={(e) => setSocialId(e.target.value)}
            maxLength={31}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="@아이디"
            aria-label={`${SOCIALS[social].label} 아이디`}
            aria-invalid={badId}
            className={`${inputClass} flex-1`}
          />
        ) : (
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="링크 (선택)" className={`${inputClass} flex-1`} />
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder={social ? "이름 (선택, 비우면 @아이디)" : "이름 (예: 달빛)"}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button
          type="button"
          disabled={!ready}
          onClick={() => onAdd({ label: name, url: social ? (idUrl ?? "") : url.trim() })}
          className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"
        >
          추가
        </button>
      </div>
      {badId && <p className="text-xs text-danger">아이디는 영문 · 숫자 · {social === "instagram" ? "마침표 · " : ""}밑줄만 쓸 수 있어요.</p>}
    </div>
  );
}
