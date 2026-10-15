"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BULK_LABEL, type BulkAction, PURGE_CONFIRM, postStateLabel, purgeDate } from "@/lib/admin/post-bulk";
import { bulkPosts } from "./actions";

export type AdminPostRow = {
  id: string;
  title: string;
  status: "draft" | "published" | "hidden";
  category: string;
  shot_year: number;
  held_at: string | null;
  removed_at: string | null;
  trashed_at: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  visibility: "public" | "followers" | "private";
  author: { handle: string } | null;
  photos: { count: number }[];
  reports: { count: number }[];
};

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
const fullDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });
const VISIBILITY = { public: "", followers: "팔로워", private: "나만" } as const;

/** 게시물 표 + 일괄 작업 바 (A-03 ③ ④). 실행 전 대상 수를 다시 확인한다. */
export function PostsTable({ rows, trash, categoryLabel }: { rows: AdminPostRow[]; trash: boolean; categoryLabel: Record<string, string> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction | null>(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const actions: BulkAction[] = trash ? ["untrash", "purge"] : ["hide", "restore", "trash"];
  const allChecked = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = () => {
    if (!action) return;
    if (!window.confirm(`${selected.size}개에 '${BULK_LABEL[action].label}'을(를) 적용합니다.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await bulkPosts({ ids: [...selected], action, note, confirm });
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      const skipped = selected.size - result.count;
      setMessage({ ok: true, text: `${result.count}개를 처리했어요.${skipped ? ` ${skipped}개는 상태가 맞지 않아 건너뛰었어요.` : ""}` });
      setSelected(new Set());
      setAction(null);
      setNote("");
      setConfirm("");
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <>
        {message && <p role="status" className="text-sm text-quiet">{message.text}</p>}
        <p className="py-16 text-center text-sm text-quiet">{trash ? "휴지통이 비어 있어요." : "해당하는 게시물이 없어요."}</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-col gap-3 rounded-xl border border-line bg-bg p-4 shadow-lg">
          <p className="text-sm font-semibold">{selected.size}개 선택됨</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="작업">
            {actions.map((a) => (
              <label
                key={a}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm has-checked:border-text has-checked:bg-text has-checked:text-bg ${BULK_LABEL[a].danger ? "border-red-400/60 text-red-300" : "border-line"}`}
              >
                <input type="radio" name="bulk-action" checked={action === a} onChange={() => setAction(a)} className="sr-only" />
                {BULK_LABEL[a].label}
              </label>
            ))}
          </div>
          {action && <p className="text-xs text-quiet">{BULK_LABEL[action].help}</p>}
          {action && (
            <div className="flex flex-col gap-2 md:flex-row">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span>
                  처리 사유 <span className="text-xs text-quiet">(필수 · 감사 로그에 남아요)</span>
                </span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base" />
              </label>
              {action === "purge" && (
                <label className="flex flex-col gap-1 text-sm md:w-56">
                  <span>
                    확인 문구 <span className="text-xs text-quiet">&lsquo;{PURGE_CONFIRM}&rsquo; 입력</span>
                  </span>
                  <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="min-h-11 rounded-xl border border-red-400/60 bg-bg px-3 text-base" />
                </label>
              )}
              <button
                type="button"
                onClick={run}
                disabled={pending || !note.trim() || (action === "purge" && confirm !== PURGE_CONFIRM)}
                className={`min-h-11 self-end rounded-xl px-5 text-sm font-semibold disabled:opacity-50 ${BULK_LABEL[action].danger ? "bg-red-500 text-white" : "bg-accent text-on-accent"}`}
              >
                {pending ? "처리 중…" : `${selected.size}개 ${BULK_LABEL[action].label}`}
              </button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-quiet" : "text-red-300"}`}>
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-surface text-left text-xs text-quiet">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="모두 선택"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                  className="size-4 accent-[var(--accent)]"
                />
              </th>
              <th scope="col" className="px-2 py-2 font-medium">제목</th>
              <th scope="col" className="px-2 py-2 font-medium">업로더</th>
              <th scope="col" className="px-2 py-2 font-medium">카테고리</th>
              <th scope="col" className="px-2 py-2 font-medium">촬영</th>
              <th scope="col" className="px-2 py-2 font-medium">상태</th>
              <th scope="col" className="px-2 py-2 font-medium">신고</th>
              <th scope="col" className="px-2 py-2 font-medium">{trash ? "영구 삭제 예정" : "게시"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const reports = r.reports[0]?.count ?? 0;
              const state = postStateLabel(r);
              return (
                <tr key={r.id} className={selected.has(r.id) ? "bg-surface" : undefined}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${r.title} 선택`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="max-w-72 px-2 py-2">
                    <Link href={`/p/${r.id}`} className="block truncate font-medium hover:underline">
                      {r.title}
                    </Link>
                    <span className="text-xs text-quiet">
                      {r.photos[0]?.count ?? 0}장{VISIBILITY[r.visibility] ? ` · ${VISIBILITY[r.visibility]}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-quiet">{r.author ? `@${r.author.handle}` : "-"}</td>
                  <td className="px-2 py-2 text-quiet">{categoryLabel[r.category] ?? r.category}</td>
                  <td className="px-2 py-2 tabular-nums text-quiet">{r.shot_year}</td>
                  <td className="px-2 py-2">
                    <span className={state === "게시됨" ? "text-quiet" : "text-amber-300"}>
                      {state}
                      {state === "예약" && r.scheduled_at ? ` ${dateFormat.format(new Date(r.scheduled_at))}` : ""}
                    </span>
                  </td>
                  <td className={`px-2 py-2 tabular-nums ${reports ? "font-semibold text-red-300" : "text-quiet"}`}>{reports}</td>
                  <td className="px-2 py-2 tabular-nums text-quiet">
                    {trash && r.trashed_at
                      ? fullDate.format(purgeDate(r.trashed_at))
                      : r.published_at
                        ? fullDate.format(new Date(r.published_at))
                        : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
