import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RepublishButton } from "@/app/p/[id]/republish-button";
import { RestorePostButton } from "@/app/p/[id]/restore-post-button";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORY_LABEL } from "@/lib/photos/categories";
import { createClient } from "@/lib/supabase/server";
import { KST } from "@/lib/format/kst";

export const metadata: Metadata = { title: "내 글 관리", robots: { index: false } };

const dateFormat = KST.date;
const DAY = 86_400_000;
const TRASH_DAYS = 30;

const TABS = [
  { key: "hidden", label: "숨긴 글" },
  { key: "deleted", label: "지운 글" },
] as const;

// 내 글 관리 (본인만): 숨긴 글은 다시 게시, 지운 글은 30일 안에 되살리기. 게시된 글은 내 프로필에서 본다.
export default async function MyPostsPage({ searchParams }: PageProps<"/me/posts">) {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/posts"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/posts"));
  const tab = (await searchParams).tab === "deleted" ? "deleted" : "hidden";

  const supabase = await createClient();
  let query = supabase
    .from("posts")
    .select("id, title, category, shot_year, removed_at, trashed_at, created_at")
    .eq("author_id", viewer.id)
    .limit(200);
  query =
    tab === "deleted"
      ? query.eq("trashed_by_author", true).not("trashed_at", "is", null).order("trashed_at", { ascending: false })
      : query.eq("status", "hidden").is("trashed_at", null).order("created_at", { ascending: false });
  const { data: posts, error } = await query;
  if (error) throw error;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 pb-16 md:px-6">
      <header className="flex flex-col gap-2 pb-4">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이페이지
        </Link>
        <h1 className="text-2xl font-bold">내 글 관리</h1>
        <p className="text-sm text-quiet">나만 볼 수 있어요. 게시된 글은 내 프로필에서 볼 수 있어요.</p>
      </header>

      <nav aria-label="내 글 종류" className="flex gap-6 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "hidden" ? "/me/posts" : "/me/posts?tab=deleted"}
            aria-current={tab === t.key ? "page" : undefined}
            className="inline-flex min-h-10 items-center border-b-2 border-transparent px-1 text-sm aria-[current=page]:border-text aria-[current=page]:font-semibold"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="py-3 text-xs leading-relaxed text-quiet">
        {tab === "deleted"
          ? `지운 글은 ${TRASH_DAYS}일 동안 여기 있다가 사진까지 영구 삭제돼요. 그 전에는 되살릴 수 있어요.`
          : "숨긴 글은 다른 사람에게 보이지 않아요. 언제든 다시 게시할 수 있어요."}
      </p>

      {posts.length === 0 ? (
        <EmptyState text={tab === "deleted" ? "지운 글이 없어요." : "숨긴 글이 없어요."} />
      ) : (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {posts.map((p) => {
            const purgeAt = p.trashed_at ? Date.parse(p.trashed_at) + TRASH_DAYS * DAY : null;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${p.id}`} className="block truncate font-medium hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-xs text-quiet">
                    {CATEGORY_LABEL[p.category]} · {p.shot_year}
                    {purgeAt !== null && ` · ${dateFormat.format(new Date(purgeAt))}에 영구 삭제`}
                    {tab === "hidden" && p.removed_at && " · 운영자가 게시를 중단한 글 (소명은 게시물 화면에서)"}
                  </p>
                </div>
                {tab === "deleted" ? <RestorePostButton postId={p.id} /> : !p.removed_at && <RepublishButton postId={p.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
