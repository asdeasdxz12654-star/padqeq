import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { loadInbox } from "@/lib/admin/inbox";
import { ageLabel, INBOX_KIND_LABEL, type InboxKind, type InboxLevel } from "@/lib/admin/inbox-rank";

export const metadata: Metadata = { title: "처리함" };

const LEVEL_CLASS: Record<InboxLevel, string> = {
  긴급: "bg-accent text-on-accent",
  주의: "bg-accent-soft text-accent",
  보통: "border border-line text-quiet",
};

// 처리함 (관리자 디자인 v2): 신고 · 소명 · 문의 · 요청을 급한 순서 한 목록. 처리는 눌러서 원래 화면에서.
export default async function AdminInboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  const params = await searchParams;
  const isAdmin = (await getViewer())?.profile?.role === "admin";
  const all = await loadInbox(isAdmin);
  const kinds = [...new Set(all.map((i) => i.kind))];
  const kind = typeof params.kind === "string" && kinds.includes(params.kind as InboxKind) ? (params.kind as InboxKind) : null;
  const items = kind ? all.filter((i) => i.kind === kind) : all;
  const urgent = all.filter((i) => i.level === "긴급").length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold">처리함</h1>
        <p className="text-sm text-quiet">
          {all.length === 0 ? "처리할 일이 없어요" : `${all.length}건${urgent ? ` · 긴급 ${urgent}건` : ""} · 급한 것부터, 같으면 오래된 것부터`}
        </p>
      </header>

      {kinds.length > 1 && (
        <nav aria-label="종류" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <Chip href="/admin/inbox" current={!kind}>
            전체 {all.length}
          </Chip>
          {kinds.map((k) => (
            <Chip key={k} href={`/admin/inbox?kind=${k}`} current={kind === k}>
              {INBOX_KIND_LABEL[k]} {all.filter((i) => i.kind === k).length}
            </Chip>
          ))}
        </nav>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-line p-10 text-center text-sm text-quiet">모두 처리했어요. 수고했어요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={i.href} prefetch={false} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_CLASS[i.level]}`}>{i.level}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{i.title}</span>
                  <span className="truncate text-xs text-quiet">
                    {INBOX_KIND_LABEL[i.kind]}
                    {i.sub && ` · ${i.sub}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-quiet tabular-nums">{ageLabel(i.hours)} 전</span>
                <span aria-hidden className="text-quiet">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={current ? "page" : undefined}
      className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-line px-3.5 text-sm tabular-nums aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
    >
      {children}
    </Link>
  );
}
