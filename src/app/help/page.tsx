import type { Metadata } from "next";
import Link from "next/link";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { OPERATOR } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { FAQ } from "@/lib/support/faq";
import { INQUIRY_ANSWER_DAYS, INQUIRY_CATEGORY_LABEL, NOTICE_CATEGORY_LABEL } from "@/lib/support/labels";
import { InquiryForm } from "./inquiry-form";

export const metadata: Metadata = { title: "고객센터" };

// S-20 고객센터: 공지 · 자주 묻는 질문 · 1:1 문의 (비로그인은 공지 · FAQ만)

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

const TABS = { notices: "공지", faq: "자주 묻는 질문", inquiry: "1:1 문의" } as const;
type Tab = keyof typeof TABS;

export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const params = await searchParams;
  const tab: Tab = params.tab === "faq" || params.tab === "inquiry" ? params.tab : "notices";
  const errorRef = typeof params.ref === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(params.ref) ? params.ref : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 pb-16 md:px-6">
      <h1 className="text-2xl font-bold">고객센터</h1>
      <nav aria-label="고객센터" className="mt-5 flex gap-2 text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={t === "notices" ? "/help" : `/help?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            {TABS[t]}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        {tab === "notices" ? <Notices /> : tab === "faq" ? <Faq /> : <Inquiries errorRef={errorRef} />}
      </div>
    </div>
  );
}

async function Notices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notices")
    .select("id, category, title, pinned, published_at")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  if (data.length === 0) return <p className="py-12 text-center text-sm text-quiet">아직 공지가 없어요.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {data.map((n) => (
        <li key={n.id}>
          <Link href={`/help/notices/${n.id}`} className="flex min-h-12 items-center gap-3 py-3 hover:text-text">
            <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-xs text-quiet">{NOTICE_CATEGORY_LABEL[n.category]}</span>
            <span className="min-w-0 flex-1 truncate">
              {n.pinned && <span className="mr-1 text-accent">고정</span>}
              {n.title}
            </span>
            <span className="shrink-0 text-xs text-quiet">{dateFormat.format(new Date(n.published_at))}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Faq() {
  return (
    <div className="flex flex-col gap-2">
      {FAQ.map((item) => (
        <details key={item.q} className="group rounded-xl border border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium">
            {item.q}
            <span aria-hidden="true" className="text-quiet transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="px-4 pb-4 text-sm leading-relaxed text-quiet">{item.a}</p>
        </details>
      ))}
      <p className="mt-4 text-sm text-quiet">
        찾는 답이 없으면{" "}
        <Link href="/help?tab=inquiry" className="underline underline-offset-2">
          1:1 문의
        </Link>
        를 남겨 주세요. 회원이 아니라면{" "}
        <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-2">
          {OPERATOR.email}
        </a>
        로 보내 주세요.
      </p>
    </div>
  );
}

async function Inquiries({ errorRef }: { errorRef: string | null }) {
  const viewer = await getViewer();
  if (!viewer?.profile) {
    const back = errorRef ? `/help?tab=inquiry&ref=${errorRef}` : "/help?tab=inquiry";
    return (
      <div className="rounded-xl border border-line p-6 text-center text-sm">
        <p>1:1 문의는 로그인한 뒤 남길 수 있어요.</p>
        <p className="mt-1 text-quiet">
          회원이 아니라면{" "}
          <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-2">
            {OPERATOR.email}
          </a>
          로 보내 주세요.
        </p>
        <Link href={withNext("/login", back)} className="mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 font-semibold text-on-accent">
          로그인
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select("id, category, body, error_ref, status, answer, answered_at, created_at")
    .eq("author_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="ask-heading">
        <h2 id="ask-heading" className="text-lg font-semibold">
          문의 남기기
        </h2>
        <p className="mt-1 text-sm text-quiet">
          영업일 기준 {INQUIRY_ANSWER_DAYS}일 안에 답할게요. 답변이 달리면 알림으로 알려 드려요.
        </p>
        <div className="mt-4">
          <InquiryForm errorRef={errorRef} />
        </div>
      </section>

      <section aria-labelledby="mine-heading">
        <h2 id="mine-heading" className="text-lg font-semibold">
          내 문의 <span className="text-sm font-normal text-quiet">{data.length}</span>
        </h2>
        {data.length === 0 ? (
          <p className="mt-3 text-sm text-quiet">남긴 문의가 없어요.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {data.map((q) => (
              <li key={q.id} className="rounded-xl border border-line p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2 text-xs text-quiet">
                  <span className="rounded border border-line px-1.5 py-0.5">{INQUIRY_CATEGORY_LABEL[q.category]}</span>
                  <span className={q.status === "answered" ? "text-ok" : "text-warn"}>
                    {q.status === "answered" ? "답변 완료" : "답변 대기"}
                  </span>
                  <span>{timeFormat.format(new Date(q.created_at))}</span>
                  {q.error_ref && <span>오류 번호 {q.error_ref}</span>}
                </p>
                <p className="mt-2 whitespace-pre-line">{q.body}</p>
                {q.answer && (
                  <div className="mt-3 rounded-lg bg-slot p-3">
                    <p className="text-xs text-quiet">운영자 답변 · {q.answered_at && timeFormat.format(new Date(q.answered_at))}</p>
                    <p className="mt-1 whitespace-pre-line">{q.answer}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
