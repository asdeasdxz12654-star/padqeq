import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { loadInbox } from "@/lib/admin/inbox";
import { ageLabel, INBOX_KIND_LABEL, type InboxItem, type InboxKind, type InboxLevel } from "@/lib/admin/inbox-rank";
import { createClient } from "@/lib/supabase/server";
import { EventAdminEditor } from "../events/event-admin-forms";
import {
  BOARD_REPORT_SELECT,
  BoardReportCard,
  type BoardReportRow,
  CLAIM_SELECT,
  ClaimCard,
  type ClaimRow,
  COMMENT_REPORT_SELECT,
  CommentReportCard,
  type CommentReportRow,
  MESSAGE_REPORT_SELECT,
  MessageReportCard,
  type MessageReportRow,
} from "../reports/cards";
import { APPEAL_POST, AppealDetail, type AppealRow, REPORT_SELECT, ReportDetail, type ReportRow } from "../reports/details";
import { INQUIRY_SELECT, InquiryCard, type InquiryRow } from "../support/inquiry-card";
import { REGIONS, type Region } from "@/lib/events/calendar";

export const metadata: Metadata = { title: "처리함" };

const LEVEL_CLASS: Record<InboxLevel, string> = {
  긴급: "bg-accent text-on-accent",
  주의: "bg-accent-soft text-accent",
  보통: "border border-line text-quiet",
};

// 처리함 (관리 시안 43): 신고 · 소명 · 문의 · 요청을 급한 순서 한 목록.
// 고르면 오른쪽 칸(휴대폰은 목록 대신 전체 화면)에서 바로 처리하고, 처리해서 사라지면 같은 목록의 다음 건을 연다.
export default async function AdminInboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  const params = await searchParams;
  const isAdmin = (await getViewer())?.profile?.role === "admin";
  const all = await loadInbox(isAdmin);
  const kinds = [...new Set(all.map((i) => i.kind))];
  const kind = typeof params.kind === "string" && kinds.includes(params.kind as InboxKind) ? (params.kind as InboxKind) : null;
  const items = kind ? all.filter((i) => i.kind === kind) : all;
  const urgent = all.filter((i) => i.level === "긴급").length;
  // 고른 건이 처리돼 사라졌으면 같은 목록의 다음 건 (처리하면 화면이 같은 주소로 새로 그려진다)
  const asked = typeof params.item === "string" ? params.item : null;
  const selected = asked ? (all.find((i) => i.key === asked) ?? items[0] ?? null) : null;
  const qs = (item: string | null) => {
    const q = new URLSearchParams();
    if (kind) q.set("kind", kind);
    if (item) q.set("item", item);
    return q.size ? `/admin/inbox?${q}` : "/admin/inbox";
  };
  // 처리하고 나면 같은 주소로 돌아와 다음 건이 열린다
  const detail = selected ? await loadDetail(selected, qs(selected.key)) : null;

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

      <div className={detail ? "grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start" : ""}>
      {detail && (
        <section aria-label="고른 항목" className="flex flex-col gap-5 rounded-xl border border-line p-4 md:p-5 lg:order-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_CLASS[selected!.level]}`}>{selected!.level}</span>
            <span className="text-sm text-quiet">
              {INBOX_KIND_LABEL[selected!.kind]} · {ageLabel(selected!.hours)} 전
            </span>
            <Link href={qs(null)} prefetch={false} className="ml-auto inline-flex min-h-10 items-center text-sm text-quiet hover:text-text">
              닫기
            </Link>
          </div>
          {detail}
        </section>
      )}
      <div className={detail ? "hidden lg:block" : ""}>
      {items.length === 0 ? (
        <p className="rounded-xl border border-line p-10 text-center text-sm text-quiet">모두 처리했어요. 수고했어요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
          {items.map((i) => (
            <li key={i.key}>
              <Link
                href={qs(i.key)}
                prefetch={false}
                aria-current={selected?.key === i.key ? "true" : undefined}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface aria-[current=true]:bg-accent-soft"
              >
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
      </div>
    </div>
  );
}

/** 고른 건의 처리 칸 (종류마다 원래 화면의 처리 카드를 그대로 쓴다) */
async function loadDetail(item: InboxItem, backHref: string) {
  const supabase = await createClient();
  const id = item.key.slice(item.kind.length + 1);
  switch (item.kind) {
    case "report": {
      const { data } = await supabase.from("reports").select(REPORT_SELECT).eq("status", "open").eq("post_id", id).order("created_at").limit(100);
      const reports = (data ?? []) as unknown as ReportRow[];
      const post = reports[0]?.post;
      return post ? <ReportDetail group={{ post, reports }} backHref={backHref} /> : null;
    }
    case "appeal": {
      const { data } = await supabase.from("appeals").select(`id, statement, created_at, ${APPEAL_POST}`).eq("id", id).eq("status", "open").maybeSingle();
      const appeal = data as unknown as AppealRow | null;
      return appeal?.post ? <AppealDetail appeal={appeal} post={appeal.post} backHref={backHref} /> : null;
    }
    case "comment": {
      // 같은 댓글에 들어온 신고를 함께 본다
      const { data: one } = await supabase.from("comment_reports").select("comment_id").eq("id", id).maybeSingle();
      if (!one) return null;
      const { data } = await supabase.from("comment_reports").select(COMMENT_REPORT_SELECT).eq("status", "open").eq("comment_id", one.comment_id).order("created_at");
      const reports = (data ?? []) as unknown as CommentReportRow[];
      const comment = reports[0]?.comment;
      return comment ? <CommentReportCard comment={comment} reports={reports} /> : null;
    }
    case "board": {
      // 같은 글(또는 같은 답글)에 들어온 신고를 함께 본다
      const { data: one } = await supabase.from("board_reports").select("board_post_id, reply_id").eq("id", id).maybeSingle();
      if (!one) return null;
      let query = supabase.from("board_reports").select(BOARD_REPORT_SELECT).eq("status", "open").eq("board_post_id", one.board_post_id);
      query = one.reply_id ? query.eq("reply_id", one.reply_id) : query.is("reply_id", null);
      const { data } = await query.order("created_at");
      const reports = (data ?? []) as unknown as BoardReportRow[];
      const post = reports[0]?.post;
      return post ? <BoardReportCard post={post} reply={reports[0]!.reply} reports={reports} /> : null;
    }
    case "message": {
      const { data } = await supabase.from("message_reports").select(MESSAGE_REPORT_SELECT).eq("id", id).eq("status", "open").maybeSingle();
      return data ? <MessageReportCard report={data as unknown as MessageReportRow} /> : null;
    }
    case "inquiry": {
      const { data } = await supabase.from("inquiries").select(INQUIRY_SELECT).eq("id", id).eq("status", "open").maybeSingle();
      return data ? <InquiryCard inquiry={data as unknown as InquiryRow} /> : null;
    }
    case "claim": {
      const { data } = await supabase.from("credit_claims").select(CLAIM_SELECT).eq("id", id).eq("status", "open").maybeSingle();
      return data ? <ClaimCard claim={data as unknown as ClaimRow} /> : null;
    }
    case "event": {
      const [{ data: e }, { data: places }] = await Promise.all([
        supabase.from("events").select("id, name, starts_on, ends_on, venue, region, url, description, place_tag_id").eq("id", id).eq("status", "proposed").maybeSingle(),
        supabase.from("tags").select("id, name, lat").eq("kind", "place").order("name").limit(1000),
      ]);
      if (!e) return null;
      return (
        <EventAdminEditor
          id={e.id}
          proposed
          placeId={e.place_tag_id}
          places={(places ?? []).map((p) => ({ id: p.id, name: p.name, hasLocation: p.lat !== null }))}
          doneHref={backHref}
          initial={{
            name: e.name,
            startsOn: e.starts_on,
            endsOn: e.ends_on,
            venue: e.venue,
            region: (REGIONS as readonly string[]).includes(e.region) ? (e.region as Region) : "서울",
            url: e.url ?? "",
            description: e.description ?? "",
          }}
        />
      );
    }
  }
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
