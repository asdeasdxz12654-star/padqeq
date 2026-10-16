import { isUuid } from "@/lib/ids";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { photoSources } from "@/lib/photos/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_PHOTOS_PER_POST } from "@/lib/photos/post-input";
import { AddPhotos } from "./add-photos";
import { EditForm } from "./edit-form";

export const metadata: Metadata = { title: "게시물 편집", robots: { index: false } };


// S-07 ⑨ 게시물 편집 (작성자만). 사진 더하기는 게시된 글에서만 (초안은 업로드 화면에서).
export default async function EditPostPage({ params }: PageProps<"/p/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", `/p/${id}/edit`));

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select(
      `id, author_id, title, body, category, shot_year, shot_on, status, removed_at, has_people, visibility, comment_policy, scheduled_at, show_exif, veil, veil_by_staff, photos(id, position, alt_text, width, height, storage_key, ready_at), post_tags(tag_id),
       credits(id, role, status, created_at, external_label, external_url, member:profiles!credits_member_id_fkey(handle))`,
    )
    .eq("id", id)
    .order("position", { referencedTable: "photos" })
    .maybeSingle();
  // 남의 글은 없는 글과 같게
  if (!post || post.author_id !== viewer.id) notFound();

  const tagIds = post.post_tags.map((pt) => pt.tag_id);
  const [{ data: tags }, photos] = await Promise.all([
    tagIds.length
      ? supabase.from("tags").select("id, kind, name, slug, status, parent_id").in("id", tagIds)
      : Promise.resolve({ data: [] }),
    Promise.all(
      // 다 올라가지 않은 추가 사진은 빼고 보여 준다 (하루 뒤 정리)
      post.photos.filter((p) => p.ready_at !== null).map(async (p) => ({
        id: p.id,
        altText: p.alt_text,
        width: p.width,
        height: p.height,
        sources: await photoSources(p, ["400"]),
      })),
    ),
  ]);
  const parentIds = [...new Set((tags ?? []).flatMap((t) => (t.parent_id ? [t.parent_id] : [])))];
  const { data: parents } = parentIds.length
    ? await supabase.from("tags").select("id, name").in("id", parentIds)
    : { data: [] };
  const parentName = new Map((parents ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 pb-16 md:px-6">
      <h1 className="mb-6 text-2xl font-bold">게시물 편집</h1>
      {post.status !== "draft" && !post.removed_at && viewer.profile?.can_upload && (!post.has_people || viewer.profile.role === "admin") && photos.length < MAX_PHOTOS_PER_POST && (
        <div className="mb-8">
          <AddPhotos postId={post.id} room={MAX_PHOTOS_PER_POST - post.photos.length} />
        </div>
      )}
      <EditForm
        // 사진을 더하면 새 목록으로 다시 그린다
        key={photos.map((p) => p.id).join()}
        initial={{
          postId: post.id,
          title: post.title,
          body: post.body,
          category: post.category,
          shotYear: post.shot_year,
          shotOn: post.shot_on,
          visibility: post.visibility,
          commentPolicy: post.comment_policy,
          showExif: post.show_exif,
          veil: post.veil,
          veilLocked: post.veil_by_staff,
          // 아직 예약 중일 때만 시각을 바꿀 수 있다
          scheduledAt: post.scheduled_at && Date.parse(post.scheduled_at) > Date.parse(new Date().toISOString()) ? post.scheduled_at : null,
          tags: (tags ?? []).map((t) => ({
            id: t.id,
            kind: t.kind,
            name: t.name,
            slug: t.slug,
            parentName: t.parent_id ? (parentName.get(t.parent_id) ?? null) : null,
            pending: t.status === "pending",
          })),
          photos,
          credits: post.credits
            .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
            .map((c) =>
              c.external_label !== null
                ? { key: `id:${c.id}`, kind: "external" as const, role: c.role, label: c.external_label, url: c.external_url ?? "" }
                : // 탈퇴 유예 중인 회원은 핸들이 보이지 않는다 (RLS)
                  {
                    key: `id:${c.id}`,
                    kind: "member" as const,
                    role: c.role,
                    handle: c.member?.handle ?? "알 수 없음",
                    status: c.status === "external" ? undefined : c.status,
                  },
            ),
        }}
        viewerHandle={viewer.profile?.handle ?? null}
        isAdmin={viewer.profile?.role === "admin"}
      />
    </div>
  );
}
