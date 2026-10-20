import { isUuid } from "@/lib/ids";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CollectionForm } from "@/components/collection-form";
import { PhotoFeed } from "@/components/photo-feed";
import { getViewer } from "@/lib/auth/viewer";
import { loadFeedByIds } from "@/lib/posts/feed";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { ExhibitForm } from "./exhibit-form";


// 볼 수 있는 컬렉션만 (공개 · 내 것, RLS). 없거나 볼 수 없으면 같은 화면.
const getCollection = cache(async (id: string) => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("collections")
    .select("id, owner_id, title, description, is_public, exhibited_at, exhibit_note, owner:profiles!collections_owner_id_fkey(handle, display_name)")
    .eq("id", id)
    .maybeSingle();
  return data?.owner ? { ...data, owner: data.owner } : null;
});

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const collection = await getCollection((await params).id);
  if (!collection) return { title: "볼 수 없는 컬렉션", robots: { index: false } };
  return {
    title: `${collection.title} · @${collection.owner.handle}`,
    description: collection.description || undefined,
    robots: collection.is_public ? undefined : { index: false },
  };
}

export default async function CollectionPage({ params }: PageProps<"/c/[id]">) {
  const [collection, viewer] = await Promise.all([getCollection((await params).id), getViewer()]);
  if (!collection) notFound();
  const isOwner = viewer?.id === collection.owner_id;
  const isAdmin = viewer?.profile?.role === "admin";

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("collection_posts")
    .select("post_id")
    .eq("collection_id", collection.id)
    .order("added_at", { ascending: false })
    .limit(200);
  const items = await loadFeedByIds((rows ?? []).map((r) => r.post_id));

  return (
    <div className="mx-auto max-w-[1440px] pb-16">
      <header className="flex flex-col gap-2 px-4 pt-8 pb-4 md:px-6">
        <p className="text-sm text-quiet">
          <Link href={`${profileHref(collection.owner.handle)}?tab=collections`} className="hover:text-text">
            @{collection.owner.handle}의 컬렉션
          </Link>
          {!collection.is_public && " · 나만 보기"}
          {collection.exhibited_at && " · 해담 전시"}
        </p>
        <h1 className="text-2xl font-bold">{collection.title}</h1>
        {collection.description && <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed">{collection.description}</p>}
        {isAdmin && collection.is_public && (
          <ExhibitForm id={collection.id} exhibited={collection.exhibited_at !== null} note={collection.exhibit_note} />
        )}
        {isOwner && (
          <details className="mt-2 max-w-xl rounded-xl border border-line p-4">
            <summary className="cursor-pointer text-sm font-semibold">컬렉션 수정</summary>
            <div className="mt-4">
              <CollectionForm
                collection={{ id: collection.id, title: collection.title, description: collection.description, isPublic: collection.is_public }}
              />
            </div>
          </details>
        )}
      </header>
      <PhotoFeed
        items={items}
        empty={isOwner ? "아직 담은 게시물이 없어요. 내 글 화면에서 '저장'을 누르면 컬렉션을 고를 수 있어요." : "아직 담긴 게시물이 없어요."}
      />
    </div>
  );
}
