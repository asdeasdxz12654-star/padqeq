"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { escapeLike } from "@/lib/posts/feed-params";
import { cleanTagName, parseAliases, TAG_KINDS, type TagKind, tagSlug } from "@/lib/tags/tag-rules";
import { createClient } from "@/lib/supabase/server";

export type TagOption = { id: string; kind: TagKind; name: string; slug: string; parentName: string | null; pending: boolean };

export type MemberOption = { handle: string; displayName: string };

/** 크레딧용 회원 찾기: 핸들 앞부분 · 표시 이름 일부 (공개 프로필 정보만) */
export async function searchMembers(rawQuery: string): Promise<MemberOption[]> {
  const viewer = await getViewer();
  if (!viewer?.profile?.can_upload) return [];
  const query = String(rawQuery).trim().replace(/^@/, "").slice(0, 30);
  if (!query) return [];
  const supabase = await createClient();
  const [byHandle, byName] = await Promise.all([
    /^[a-z0-9_]+$/i.test(query)
      ? supabase.from("profiles").select("handle, display_name").ilike("handle", `${escapeLike(query.toLowerCase())}%`).limit(6)
      : Promise.resolve({ data: [] as { handle: string; display_name: string }[] }),
    supabase.from("profiles").select("handle, display_name").ilike("display_name", `%${escapeLike(query)}%`).limit(6),
  ]);
  const seen = new Set<string>();
  const out: MemberOption[] = [];
  for (const m of [...(byHandle.data ?? []), ...(byName.data ?? [])]) {
    const handle = String(m.handle);
    if (seen.has(handle)) continue;
    seen.add(handle);
    out.push({ handle, displayName: m.display_name });
  }
  return out.slice(0, 6);
}

/** 업로드 화면 태그 검색: 이름 · 별칭에 검색어가 들어간 태그 (볼 수 있는 것만, RLS) */
export async function searchTags(rawQuery: string): Promise<TagOption[]> {
  const viewer = await getViewer();
  if (!viewer?.profile?.can_upload) return [];
  const query = cleanTagName(String(rawQuery)).slice(0, 30);
  if (!query) return [];
  const pattern = `%${escapeLike(query)}%`;

  const supabase = await createClient();
  const [byName, byAlias] = await Promise.all([
    supabase.from("tags").select("id").ilike("name", pattern).limit(10),
    supabase.from("tag_aliases").select("tag_id").ilike("alias", pattern).limit(10),
  ]);
  const ids = [...new Set([...(byName.data ?? []).map((r) => r.id), ...(byAlias.data ?? []).map((r) => r.tag_id)])];
  if (!ids.length) return [];

  const { data } = await supabase
    .from("tags")
    .select("id, kind, name, slug, status, parent:tags!tags_parent_id_fkey(name)")
    .in("id", ids.slice(0, 20));
  return (data ?? [])
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      slug: t.slug,
      // 자기 참조 관계라 타입은 배열로 추론된다 (실제로는 하나)
      parentName: (Array.isArray(t.parent) ? t.parent[0]?.name : (t.parent as { name: string } | null)?.name) ?? null,
      pending: t.status === "pending",
    }))
    .sort((a, b) => Number(!a.name.startsWith(query)) - Number(!b.name.startsWith(query)) || a.name.localeCompare(b.name, "ko"))
    .slice(0, 10);
}

const createSchema = z.object({
  kind: z.enum(TAG_KINDS),
  name: z.string(),
  parentId: z.uuid().nullable(),
  aliases: z.string().max(400).default(""),
});

/**
 * 새 태그. 운영자가 만들면 바로 공식, 업로드 권한 회원이 만들면 제안(승인 전까지 본인 글에만).
 * 같은 주소(slug)가 이미 있으면 캐릭터는 "이름-작품"으로 한 번 더 시도한다.
 */
export async function createTag(input: z.input<typeof createSchema>): Promise<{ ok: true; tag: TagOption } | { ok: false; error: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile?.can_upload) return { ok: false, error: "업로드 권한이 없어요." };

  const { kind, parentId } = parsed.data;
  const name = cleanTagName(parsed.data.name);
  const slug = tagSlug(name);
  if (!name || !slug) return { ok: false, error: "태그 이름을 확인해 주세요." };
  if ((kind === "character") !== (parentId !== null)) {
    return { ok: false, error: kind === "character" ? "캐릭터는 작품을 골라 주세요." : "잘못된 요청이에요." };
  }
  const aliases = parseAliases(parsed.data.aliases, name);
  const supabase = await createClient();

  let parentName: string | null = null;
  const candidates = [slug];
  if (parentId) {
    const { data: parent } = await supabase.from("tags").select("name, slug, kind").eq("id", parentId).maybeSingle();
    if (parent?.kind !== "work") return { ok: false, error: "상위 작품을 찾을 수 없어요." };
    parentName = parent.name;
    candidates.push(`${slug}-${parent.slug}`.slice(0, 60));
  }

  const isAdmin = viewer.profile.role === "admin";
  for (const candidate of candidates) {
    let id: string | null = null;
    let duplicate = false;
    if (isAdmin) {
      const { data, error } = await supabase.rpc("create_official_tag", {
        tag_kind: kind,
        tag_slug: candidate,
        tag_name: name,
        ...(parentId && { parent: parentId }),
        aliases,
      });
      id = data ?? null;
      duplicate = error?.code === "23505";
      if (error && !duplicate) return { ok: false, error: "태그를 만들지 못했어요." };
    } else {
      const { data, error } = await supabase
        .from("tags")
        .insert({ kind, slug: candidate, name, parent_id: parentId, created_by: viewer.id })
        .select("id")
        .single();
      id = data?.id ?? null;
      duplicate = error?.code === "23505";
      if (error && !duplicate) return { ok: false, error: "태그를 만들지 못했어요." };
      if (id && aliases.length) await supabase.from("tag_aliases").insert(aliases.map((alias) => ({ tag_id: id!, alias })));
    }
    if (id) return { ok: true, tag: { id, kind, name, slug: candidate, parentName, pending: !isAdmin } };
    if (!duplicate) break;
  }
  return { ok: false, error: "같은 이름의 태그가 이미 있어요. 검색해서 골라 주세요." };
}
