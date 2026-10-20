import Link from "next/link";
import { KST } from "@/lib/format/kst";
import { INQUIRY_CATEGORY_LABEL } from "@/lib/support/labels";
import { AnswerForm } from "./forms";

// 1:1 문의 한 건 (내용 · 회원 · 답변 쓰기). 처리함(오른쪽 칸)과 고객센터 운영 화면이 함께 쓴다.

export type InquiryRow = {
  id: string;
  category: keyof typeof INQUIRY_CATEGORY_LABEL;
  body: string;
  error_ref: string | null;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
  author: { id: string; handle: string } | null;
};

export const INQUIRY_SELECT = "id, category, body, error_ref, answer, created_at, answered_at, author:profiles!inquiries_author_id_fkey(id, handle)";

export function InquiryCard({ inquiry: q }: { inquiry: InquiryRow }) {
  return (
    <div className="rounded-xl border border-line p-4 text-sm">
      <p className="flex flex-wrap items-center gap-2 text-xs text-quiet">
        <span className="rounded border border-line px-1.5 py-0.5">{INQUIRY_CATEGORY_LABEL[q.category]}</span>
        {q.author ? (
          <Link href={`/admin/members/${q.author.id}`} className="hover:underline">
            @{q.author.handle}
          </Link>
        ) : (
          <span>탈퇴한 회원</span>
        )}
        <span>{KST.dateTime.format(new Date(q.created_at))}</span>
        {q.error_ref && <span className="font-mono">오류 {q.error_ref}</span>}
      </p>
      <p className="mt-2 whitespace-pre-line">{q.body}</p>
      <div className="mt-3">
        <AnswerForm id={q.id} initial={q.answer ?? ""} />
      </div>
    </div>
  );
}
