"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { collectionSchema, type CollectionInput, MAX_COLLECTION_POSTS, MAX_COLLECTIONS } from "./input";

// 컬렉션 만들기 · 고치기 · 지우기 · 글 담기. 권한(내 컬렉션 · 내 글 또는 크레딧된 글)은 RLS가 다시 확인한다.

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function member() {
  const viewer = await getViewer();
  return viewer?.profile ? viewer : null;
}

export async function createCollection(input: CollectionInput): Promise<Result<{ id: string }>> {
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await member();
  if (!viewer) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .insert({ owner_id: viewer.id, title: parsed.data.title, description: parsed.data.description, is_public: parsed.data.isPublic })
    .select("id")
    .single();
  if (error) {
    if (error.message.includes("collection_limit")) return { ok: false, error: `컬렉션은 ${MAX_COLLECTIONS}개까지 만들 수 있어요.` };
    return { ok: false, error: "컬렉션을 만들지 못했어요." };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data.id } };
}

export async function updateCollection(id: string, input: CollectionInput): Promise<Result> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = collectionSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await member();
  if (!viewer) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .update({ title: parsed.data.title, description: parsed.data.description, is_public: parsed.data.isPublic })
    .eq("id", parsedId.data)
    .eq("owner_id", viewer.id)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

/** 컬렉션만 지운다 (담긴 게시물은 그대로) */
export async function deleteCollection(id: string): Promise<Result> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await member();
  if (!viewer) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("collections").delete().eq("id", parsedId.data).eq("owner_id", viewer.id).select("id");
  if (error || !data?.length) return { ok: false, error: "지우지 못했어요." };
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

const putSchema = z.object({ collectionId: z.uuid(), postId: z.uuid(), add: z.boolean() });

export async function setCollectionPost(input: z.input<typeof putSchema>): Promise<Result> {
  const parsed = putSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await member();
  if (!viewer) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { collectionId, postId, add } = parsed.data;
  const { error } = add
    ? await supabase
        .from("collection_posts")
        .upsert({ collection_id: collectionId, post_id: postId }, { onConflict: "collection_id,post_id", ignoreDuplicates: true })
    : await supabase.from("collection_posts").delete().eq("collection_id", collectionId).eq("post_id", postId);
  if (error) {
    if (error.message.includes("collection_full")) return { ok: false, error: `컬렉션 하나에 ${MAX_COLLECTION_POSTS}개까지 담을 수 있어요.` };
    return { ok: false, error: add ? "담지 못했어요. 내 글이나 내가 크레딧된 글만 담을 수 있어요." : "빼지 못했어요." };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
