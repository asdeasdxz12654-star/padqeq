import type { Metadata } from "next";
import Link from "next/link";
import { getAdminPending } from "@/lib/admin/pending";
import { getSiteSwitches } from "@/lib/support/switches";

export const metadata: Metadata = { title: "운영" };

// 운영 첫 화면: 처리할 일 모아 보기 + 각 운영 화면으로
export default async function AdminHomePage() {
  const [pending, switches] = await Promise.all([getAdminPending(), getSiteSwitches()]);
  const switchOn = switches.readOnly || switches.signupClosed || switches.uploadsClosed;

  const cards: { href: string; title: string; help: string; count: number }[] = [
    { href: "/admin/reports", title: "게시물 신고", help: "급한 사유 · 오래된 순", count: pending.reports },
    { href: "/admin/reports?tab=appeals", title: "소명", help: "조치된 글의 이의 제기", count: pending.appeals },
    { href: "/admin/reports?tab=comments", title: "댓글 신고", help: "가리기 · 기각", count: pending.comments },
    { href: "/admin/reports?tab=board", title: "게시판 신고", help: "글 · 답글", count: pending.board },
    { href: "/admin/reports?tab=messages", title: "메시지 신고", help: "열람 기록이 남아요", count: pending.messages },
    { href: "/admin/support", title: "1:1 문의", help: "답하면 회원에게 알림", count: pending.inquiries },
    { href: "/admin/events", title: "행사 제안", help: "승인하면 행사 태그가 생겨요", count: pending.events },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">운영</h1>
        <span className="text-sm text-quiet">{pending.total ? `처리할 일 ${pending.total}건` : "처리할 일이 없어요"}</span>
      </header>

      {switchOn && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          긴급 스위치가 켜져 있어요 ({[switches.readOnly && "읽기 전용", switches.signupClosed && "가입 중단", switches.uploadsClosed && "업로드 중단"].filter(Boolean).join(" · ")}).{" "}
          <Link href="/admin/support?tab=system" className="underline underline-offset-2">
            스위치 보기
          </Link>
        </p>
      )}

      <section aria-labelledby="todo-heading">
        <h2 id="todo-heading" className="mb-3 text-lg font-semibold">
          처리할 일
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="flex h-full flex-col gap-1 rounded-xl border border-line p-4 hover:border-quiet">
                <span className="flex items-center justify-between font-semibold">
                  {c.title}
                  <span className={`rounded-full px-2 text-sm ${c.count ? "bg-red-500/20 text-red-300" : "text-quiet"}`}>{c.count}</span>
                </span>
                <span className="text-xs text-quiet">{c.help}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="mb-3 text-lg font-semibold">
          관리
        </h2>
        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ["/admin/members", "회원 관리"],
            ["/admin/events", "행사 관리"],
            ["/admin/support?tab=notices", "공지"],
            ["/admin/support?tab=system", "긴급 스위치"],
            ["/upload", "업로드"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-xl border border-line px-4 py-2 hover:border-quiet">
              {label}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
