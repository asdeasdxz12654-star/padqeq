import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { photoSources } from "@/lib/photos/server";
import { createClient } from "@/lib/supabase/server";
import { EditForm } from "./edit-form";

export const metadata: Metadata = { title: "게시물 편집", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// S-07 ⑨ 게시물 편집 (작성자만). 사진 추가 · 삭제 · 순서와 크레딧은 이후 단계.
export default async function EditPostPage({ params }: PageProps<"/p/[id]/edit">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", `/p/${id}/edit`));

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, author_id, title, body, category, shot_year, shot_on, photos(id, position, alt_text, width, height, storage_key), post_tags(tag_id)",
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
      post.photos.map(async (p) => ({
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
      <EditForm
        initial={{
          postId: post.id,
          title: post.title,
          body: post.body,
          category: post.category,
          shotYear: post.shot_year,
          shotOn: post.shot_on,
          tags: (tags ?? []).map((t) => ({
            id: t.id,
            kind: t.kind,
            name: t.name,
            slug: t.slug,
            parentName: t.parent_id ? (parentName.get(t.parent_id) ?? null) : null,
            pending: t.status === "pending",
          })),
          photos,
        }}
        isAdmin={viewer.profile?.role === "admin"}
      />
    </div>
  );
}
