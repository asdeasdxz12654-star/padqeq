import { requireTopAdmin } from "@/lib/auth/require-admin";
import type { Metadata } from "next";
import Link from "next/link";
import { auditActionLabel, auditSummary, auditTargetHref } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "감사 로그" };

// A-05 감사 로그: 운영자의 모든 조치 (고칠 수 없음, 3년 보관). 행동 이름 · 대상 ID · @운영자로 찾는다.

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium" });
const PAGE = 50;

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireTopAdmin();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 60);
  const before = typeof params.before === "string" && /^\d{1,18}$/.test(params.before) ? Number(params.before) : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_audit_log", { q: q || null, before_id: before, max_rows: PAGE });
  if (error) throw error;
  const last = data.at(-1);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">감사 로그</h1>
        <p className="text-sm text-quiet">운영 조치는 모두 여기에 남고 고칠 수 없어요. 3년이 지난 기록만 정리돼요.</p>
      </header>

      <form action="/admin/audit" className="flex gap-2 md:w-[28rem]">
        <label className="sr-only" htmlFor="audit-q">
          행동 이름 · 대상 ID · @운영자
        </label>
        <input
          id="audit-q"
          name="q"
          defaultValue={q}
          placeholder="행동(예: sanction) · 대상 ID · @운영자"
          maxLength={60}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
        />
        <button type="submit" className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm hover:border-quiet">
          찾기
        </button>
      </form>

      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-quiet">기록이 없어요.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {data.map((row) => {
            const href = auditTargetHref(row.target_table, row.target_id);
            return (
              <li key={row.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{auditActionLabel(row.action, row.detail)}</span>
                  <span className="text-xs text-quiet">
                    {timeFormat.format(new Date(row.created_at))} · {row.actor_handle ? `@${row.actor_handle}` : "자동"} · #{row.id}
                  </span>
                </p>
                {auditSummary(row.detail) && <p className="break-words text-quiet">{auditSummary(row.detail)}</p>}
                {row.target_id && (
                  <p className="text-xs text-quiet">
                    대상:{" "}
                    {href ? (
                      <Link href={href} className="underline underline-offset-2">
                        {row.target_table} {row.target_id.slice(0, 8)}
                      </Link>
                    ) : (
                      `${row.target_table} ${row.target_id.slice(0, 8)}`
                    )}{" "}
                    <Link href={`/admin/audit?q=${row.target_id}`} className="underline underline-offset-2">
                      이 대상의 기록
                    </Link>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {last && data.length === PAGE && (
        <Link
          href={`/admin/audit?${new URLSearchParams({ ...(q && { q }), before: String(last.id) })}`}
          className="self-center rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet"
        >
          더 보기
        </Link>
      )}
    </div>
  );
}
