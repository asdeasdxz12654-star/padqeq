import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { NOTICE_CATEGORY_LABEL } from "@/lib/support/labels";

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short" });

async function loadNotice(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notices")
    .select("id, category, title, body, maintenance_at, published_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function generateMetadata({ params }: PageProps<"/help/notices/[id]">): Promise<Metadata> {
  const notice = await loadNotice((await params).id);
  return { title: notice ? notice.title : "공지" };
}

export default async function NoticePage({ params }: PageProps<"/help/notices/[id]">) {
  const notice = await loadNotice((await params).id);
  if (!notice) notFound();

  return (
    <article className="mx-auto max-w-2xl px-4 pt-10 pb-16 md:px-6">
      <Link href="/help" className="text-sm text-quiet hover:underline">
        ‹ 공지 목록
      </Link>
      <p className="mt-6 text-xs text-quiet">
        {NOTICE_CATEGORY_LABEL[notice.category]} · {timeFormat.format(new Date(notice.published_at))}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{notice.title}</h1>
      {notice.maintenance_at && (
        <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          점검 시작: {timeFormat.format(new Date(notice.maintenance_at))}
        </p>
      )}
      <div className="mt-6 text-[15px] leading-relaxed whitespace-pre-line">{notice.body}</div>
    </article>
  );
}
