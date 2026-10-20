"use client";

import { confirmAction } from "@/lib/ui/confirm";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Constants } from "@/lib/supabase/database.types";
import { NOTICE_CATEGORY_LABEL, type NoticeCategory, type SiteSwitches } from "@/lib/support/labels";
import { answerInquiry, deleteNotice, saveNotice, setSwitches } from "./actions";

const input = "rounded-xl border border-line bg-bg px-3 text-base";
const primary = "min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50";

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  return done ? (
    <p role="status" className="text-sm text-ok">
      {done}
    </p>
  ) : null;
}

export function AnswerForm({ id, initial }: { id: string; initial: string }) {
  const router = useRouter();
  const [reply, setReply] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await answerInquiry({ id, reply });
          if (!result.ok) return setError(result.error);
          setDone("답변했어요. 회원에게 알림이 갔어요.");
          router.refresh();
        });
      }}
    >
      <label className="sr-only" htmlFor={`answer-${id}`}>
        답변
      </label>
      <textarea
        id={`answer-${id}`}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        maxLength={3000}
        rows={4}
        required
        className={`${input} py-2`}
      />
      <Feedback error={error} done={done} />
      <button type="submit" disabled={!reply.trim() || pending} className={`${primary} self-start`}>
        {pending ? "보내는 중…" : initial ? "답변 수정" : "답변하기"}
      </button>
    </form>
  );
}

/** datetime-local 기본값 (KST) */
function toKstInput(iso: string | null): string {
  if (!iso) return "";
  const kst = new Date(Date.parse(iso) + 9 * 3_600_000);
  return kst.toISOString().slice(0, 16);
}

export type NoticeDraft = {
  id: string | null;
  category: NoticeCategory;
  title: string;
  body: string;
  maintenanceAt: string | null;
  pinned: boolean;
};

export function NoticeForm({ notice }: { notice: NoticeDraft }) {
  const router = useRouter();
  const [category, setCategory] = useState<NoticeCategory>(notice.category);
  const [title, setTitle] = useState(notice.title);
  const [body, setBody] = useState(notice.body);
  const [maintenanceAt, setMaintenanceAt] = useState(toKstInput(notice.maintenanceAt));
  const [pinned, setPinned] = useState(notice.pinned);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await saveNotice({ id: notice.id, category, title, body, maintenanceAt: maintenanceAt || null, pinned });
          if (!result.ok) return setError(result.error);
          router.push("/admin/support?tab=notices");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          분류
          <select value={category} onChange={(e) => setCategory(e.target.value as NoticeCategory)} className={`${input} min-h-11`}>
            {Constants.public.Enums.notice_category.map((c) => (
              <option key={c} value={c}>
                {NOTICE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        {category === "maintenance" && (
          <label className="flex flex-col gap-1.5 text-sm">
            점검 시작 (한국 시간)
            <input
              type="datetime-local"
              value={maintenanceAt}
              onChange={(e) => setMaintenanceAt(e.target.value)}
              required
              className={`${input} min-h-11`}
            />
          </label>
        )}
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          맨 위에 고정
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required className={`${input} min-h-11`} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        내용
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={10} required className={`${input} py-2`} />
      </label>
      {category === "maintenance" && <p className="text-xs text-quiet">점검 시작 24시간 전부터 모든 화면 위에 안내가 떠요.</p>}
      {category === "policy" && <p className="text-xs text-quiet">약관 · 개인정보처리방침 변경은 시행 7일 전(불리한 변경은 30일 전)에 올려 주세요.</p>}
      <Feedback error={error} done={null} />
      <div className="flex gap-2">
        <button type="submit" disabled={!title.trim() || !body.trim() || pending} className={primary}>
          {pending ? "저장 중…" : notice.id ? "수정" : "올리기"}
        </button>
        {notice.id && <DeleteNoticeButton id={notice.id} />}
      </div>
    </form>
  );
}

function DeleteNoticeButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmAction({ title: "이 공지를 지울까요?", confirmLabel: "지우기", danger: true }))) return;
        startTransition(async () => {
          const result = await deleteNotice(id);
          if (result.ok) {
            router.push("/admin/support?tab=notices");
            router.refresh();
          }
        });
      }}
      className="min-h-11 rounded-xl border border-line px-4 text-sm text-danger"
    >
      지우기
    </button>
  );
}

const SWITCHES = [
  ["readOnly", "읽기 전용", "회원은 보기만 할 수 있어요. 올리기 · 수정 · 신고 · 가입이 모두 멈춰요."],
  ["signupClosed", "가입 중단", "새 가입만 멈춰요. 이미 가입한 회원은 그대로 써요."],
  ["uploadsClosed", "업로드 중단", "새 게시물 · 사진 올리기만 멈춰요."],
] as const;

export function SwitchesForm({ current }: { current: SiteSwitches }) {
  const router = useRouter();
  const [state, setState] = useState(current);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = (["readOnly", "signupClosed", "uploadsClosed", "message"] as const).some((k) => current[k] !== state[k]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        startTransition(async () => {
          const result = await setSwitches({ ...state, note });
          if (!result.ok) return setError(result.error);
          setNote("");
          setDone("바꿨어요. 모든 화면에 바로 반영돼요.");
          router.refresh();
        });
      }}
    >
      {SWITCHES.map(([key, label, help]) => (
        <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-checked:border-warn-line">
          <input
            type="checkbox"
            checked={state[key]}
            onChange={(e) => setState((s) => ({ ...s, [key]: e.target.checked }))}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span className="text-sm">
            <span className="font-semibold">{label}</span>
            <span className="block text-xs text-quiet">{help}</span>
          </span>
        </label>
      ))}
      <label className="flex flex-col gap-1.5 text-sm">
        안내 문구 <span className="text-xs text-quiet">(선택 · 비우면 기본 문구. 스위치가 켜져 있을 때만 보여요)</span>
        <input
          value={state.message}
          onChange={(e) => setState((s) => ({ ...s, message: e.target.value }))}
          maxLength={200}
          className={`${input} min-h-11`}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        바꾸는 이유 <span className="text-xs text-quiet">(필수 · 감사 로그에 남아요)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required className={`${input} min-h-11`} />
      </label>
      <Feedback error={error} done={done} />
      <button type="submit" disabled={!changed || !note.trim() || pending} className={`${primary} self-start`}>
        {pending ? "바꾸는 중…" : "적용"}
      </button>
    </form>
  );
}
