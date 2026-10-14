import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { INQUIRY_CATEGORY_LABEL, NOTICE_CATEGORY_LABEL } from "@/lib/support/labels";
import { getSiteSwitches } from "@/lib/support/switches";
import { AnswerForm, type NoticeDraft, NoticeForm, SwitchesForm } from "./forms";
import { BannedWords, InviteCodes, StageForm } from "./opening-forms";

export const metadata: Metadata = { title: "고객센터 운영" };

// A-05 소통 · 시스템: 1:1 문의 답변 · 공지 · 긴급 스위치

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

const TABS = { open: "답변 대기", answered: "답변 완료", notices: "공지", system: "시스템" } as const;
type Tab = keyof typeof TABS;

type InquiryRow = {
  id: string;
  category: keyof typeof INQUIRY_CATEGORY_LABEL;
  body: string;
  error_ref: string | null;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
  author: { id: string; handle: string } | null;
};

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  const params = await searchParams;
  const tab: Tab = params.tab === "answered" || params.tab === "notices" || params.tab === "system" ? params.tab : "open";
  const supabase = await createClient();
  const { count: openCount } = await supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "open");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">고객센터 운영</h1>
        <nav aria-label="고객센터 운영" className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link
              key={t}
              href={t === "open" ? "/admin/support" : `/admin/support?tab=${t}`}
              aria-current={tab === t ? "page" : undefined}
              className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
            >
              {TABS[t]}
              {t === "open" && openCount ? ` ${openCount}` : ""}
            </Link>
          ))}
        </nav>
      </header>

      {tab === "open" || tab === "answered" ? (
        <Inquiries status={tab} />
      ) : tab === "notices" ? (
        <Notices edit={typeof params.edit === "string" ? params.edit : null} />
      ) : (
        <System />
      )}
    </div>
  );
}

async function Inquiries({ status }: { status: "open" | "answered" }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select("id, category, body, error_ref, answer, created_at, answered_at, author:profiles!inquiries_author_id_fkey(id, handle)")
    .eq("status", status)
    .order(status === "open" ? "created_at" : "answered_at", { ascending: status === "open" })
    .limit(100);
  if (error) throw error;
  const rows = data as unknown as InquiryRow[];
  if (rows.length === 0) return <p className="py-12 text-center text-sm text-quiet">{status === "open" ? "답변할 문의가 없어요." : "답변한 문의가 없어요."}</p>;

  return (
    <ul className="flex max-w-3xl flex-col gap-4">
      {rows.map((q) => (
        <li key={q.id} className="rounded-xl border border-line p-4 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-xs text-quiet">
            <span className="rounded border border-line px-1.5 py-0.5">{INQUIRY_CATEGORY_LABEL[q.category]}</span>
            {q.author ? (
              <Link href={`/admin/members/${q.author.id}`} className="hover:underline">
                @{q.author.handle}
              </Link>
            ) : (
              <span>탈퇴한 회원</span>
            )}
            <span>{timeFormat.format(new Date(q.created_at))}</span>
            {q.error_ref && <span className="font-mono">오류 {q.error_ref}</span>}
          </p>
          <p className="mt-2 whitespace-pre-line">{q.body}</p>
          <div className="mt-3">
            <AnswerForm id={q.id} initial={q.answer ?? ""} />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function Notices({ edit }: { edit: string | null }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notices")
    .select("id, category, title, body, maintenance_at, pinned, published_at")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const editing = edit === "new" ? null : data.find((n) => n.id === edit);
  const draft: NoticeDraft | null =
    edit === "new"
      ? { id: null, category: "news", title: "", body: "", maintenanceAt: null, pinned: false }
      : editing
        ? {
            id: editing.id,
            category: editing.category,
            title: editing.title,
            body: editing.body,
            maintenanceAt: editing.maintenance_at,
            pinned: editing.pinned,
          }
        : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section aria-label="공지 목록" className="flex flex-col gap-3">
        <Link href="/admin/support?tab=notices&edit=new" className="self-start rounded-xl border border-line px-4 py-2 text-sm hover:border-quiet">
          새 공지
        </Link>
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {data.length === 0 && <li className="p-4 text-sm text-quiet">공지가 없어요.</li>}
          {data.map((n) => (
            <li key={n.id}>
              <Link
                href={`/admin/support?tab=notices&edit=${n.id}`}
                aria-current={edit === n.id ? "true" : undefined}
                className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-surface aria-[current=true]:bg-surface"
              >
                <span className="shrink-0 text-xs text-quiet">{NOTICE_CATEGORY_LABEL[n.category]}</span>
                <span className="min-w-0 flex-1 truncate">
                  {n.pinned && <span className="mr-1 text-accent">고정</span>}
                  {n.title}
                </span>
                <span className="shrink-0 text-xs text-quiet">{timeFormat.format(new Date(n.published_at))}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="공지 편집">
        {draft ? <NoticeForm key={draft.id ?? "new"} notice={draft} /> : <p className="text-sm text-quiet">왼쪽에서 공지를 고르거나 새 공지를 쓰세요.</p>}
      </section>
    </div>
  );
}

async function System() {
  const supabase = await createClient();
  const [switches, { data: invites }, { data: words }] = await Promise.all([
    getSiteSwitches(),
    supabase.from("invite_codes").select("code, note, max_uses, used_count, expires_at, revoked_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("banned_words").select("word").order("word").limit(500),
  ]);
  return (
    <div className="grid max-w-5xl gap-8 lg:grid-cols-2">
      <section aria-labelledby="switch-heading" className="flex flex-col gap-3">
        <h2 id="switch-heading" className="text-lg font-semibold">
          긴급 스위치
        </h2>
        <p className="text-sm leading-relaxed text-quiet">공격 · 장애가 생기면 바로 멈출 수 있어요. 운영자 계정은 막히지 않아요. 켜면 모든 화면 위에 안내가 떠요.</p>
        <SwitchesForm current={switches} />
      </section>
      <section aria-labelledby="stage-heading" className="flex flex-col gap-3">
        <h2 id="stage-heading" className="text-lg font-semibold">
          운영 단계
        </h2>
        <StageForm current={switches.uploadStage} />
      </section>
      <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
        <h2 id="invite-heading" className="text-lg font-semibold">
          초대 코드
        </h2>
        <InviteCodes invites={invites ?? []} stage={switches.uploadStage} />
      </section>
      <section aria-labelledby="words-heading" className="flex flex-col gap-3">
        <h2 id="words-heading" className="text-lg font-semibold">
          금칙어
        </h2>
        <p className="text-sm text-quiet">댓글 · 게시판 글 · 답글 · 메시지에 들어 있으면 올라가지 않아요.</p>
        <BannedWords words={(words ?? []).map((w) => w.word)} />
      </section>
    </div>
  );
}
