import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PhotoFeed } from "@/components/photo-feed";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { loadFeed } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "저장한 사진", robots: { index: false } };

// 저장한 사진 (본인만). 최근 저장한 순서로 200개까지. 볼 수 없게 된 글은 빠진다 (RLS).
export default async function SavedPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/saved"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/saved"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select("post_id")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const order = data.map((b) => b.post_id);
  const items = order.length
    ? (await loadFeed({ year: null, category: null, query: null, postIds: order })).toSorted(
        (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
      )
    : [];

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-col gap-2 px-4 pt-8 pb-4 md:px-6">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이
        </Link>
        <h1 className="text-2xl font-bold">저장한 사진</h1>
        <p className="text-sm text-quiet">나만 볼 수 있어요. 올린 분에게도 알리지 않아요.</p>
      </header>
      <PhotoFeed items={items} empty="아직 저장한 사진이 없어요. 마음에 드는 게시물에서 저장을 눌러 보세요." />
    </div>
  );
}
