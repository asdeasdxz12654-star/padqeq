import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowedMembers } from "@/lib/follows/follows";
import { isUuid } from "@/lib/ids";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "좋아한 사람", robots: { index: false } };

// 회원 시안 46: 내 글을 좋아한 사람 (글쓴이만, RLS도 글쓴이 · 본인 · 운영자만). 다른 사람에게는 수만 보인다.
// 탈퇴했거나 내가 볼 수 없는 계정은 이름 없이 '회원 N명'으로.
export default async function LikersPage({ params }: PageProps<"/p/[id]/likes">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", `/p/${id}/likes`));

  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("id, author_id, title").eq("id", id).maybeSingle();
  // 남의 글은 없는 글과 같게
  if (!post || post.author_id !== viewer.id) notFound();

  const [{ data, error }, followed] = await Promise.all([
    supabase
      .from("post_likes")
      .select("created_at, member:profiles!post_likes_user_id_fkey(id, handle, display_name, avatar_key)")
      .eq("post_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
    getFollowedMembers(viewer.id),
  ]);
  if (error) throw error;
  const following = new Set(followed.map((m) => m.id));
  const members = data.flatMap((l) => (l.member ? [l.member] : []));
  const hidden = data.length - members.length;

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 pb-16 md:px-6">
      <Link href={`/p/${id}`} className="text-sm text-quiet underline-offset-2 hover:underline">
        ‹ {post.title}
      </Link>
      <h1 className="mt-3 text-2xl font-bold">
        좋아한 사람 <span className="text-quiet">· {data.length}</span>
      </h1>
      <p className="mt-1 mb-5 text-sm text-quiet">내 글에서만 보여요. 다른 사람에게는 수만 보여요.</p>

      {data.length === 0 ? (
        <p className="text-sm text-quiet">아직 좋아한 사람이 없어요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <Link href={profileHref(m.handle)} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar avatarKey={m.avatar_key} size={40} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">@{m.handle}</span>
                  <span className="block truncate text-xs text-quiet">{m.display_name}</span>
                </span>
              </Link>
              {m.id !== viewer.id && <FollowButton target={{ kind: "member", id: m.id }} initial={following.has(m.id)} />}
            </li>
          ))}
          {hidden > 0 && <li className="py-3 text-sm text-quiet">회원 {hidden}명 · 탈퇴했거나 비공개 계정은 이름 없이 보여요</li>}
        </ul>
      )}
    </div>
  );
}
