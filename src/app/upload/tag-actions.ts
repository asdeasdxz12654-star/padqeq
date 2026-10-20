"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { escapeLike } from "@/lib/posts/feed-params";
import { cleanTagName, parseAliases, TAG_KINDS, type TagKind, tagSlug } from "@/lib/tags/tag-rules";
import { createClient } from "@/lib/supabase/server";
import { placeWords, searchWords, type SimilarReason, similarToName } from "@/lib/tags/similar";

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

export type SimilarTagOption = TagOption & { reason: SimilarReason };

/**
 * 새 태그를 만들기 전에: 같은 대상일 것 같은 기존 태그 (띄어쓰기 · 괄호 · 다른 표기 · 한쪽 이름이 다른 쪽에 든 경우).
 * 이름의 낱말로 후보를 모은 뒤 태그 관리 › 비슷한 이름과 같은 규칙으로 고른다. 볼 수 있는 태그만 (RLS).
 */
export async function findSimilarExistingTags(rawName: string): Promise<SimilarTagOption[]> {
  const viewer = await getViewer();
  if (!viewer?.profile?.can_upload) return [];
  const name = cleanTagName(String(rawName)).slice(0, 60);
  // 장소 낱말 뿌리도 함께 (엑스코로 → 엑스코로 '대구 엑스코'도 찾게)
  const words = [...new Set([...searchWords(name), ...placeWords(name)])].slice(0, 8);
  if (!words.length) return [];
  // 낱말은 글자 · 숫자만이라 검색 조건 문법을 바꾸지 못한다
  const supabase = await createClient();
  const [byName, byAlias] = await Promise.all([
    supabase.from("tags").select("id").or(words.map((w) => `name.ilike.*${w}*`).join(",")).limit(100),
    supabase.from("tag_aliases").select("tag_id").or(words.map((w) => `alias.ilike.*${w}*`).join(",")).limit(100),
  ]);
  const ids = [...new Set([...(byName.data ?? []).map((r) => r.id), ...(byAlias.data ?? []).map((r) => r.tag_id)])].slice(0, 150);
  if (!ids.length) return [];

  const { data } = await supabase
    .from("tags")
    .select("id, kind, name, slug, status, parent:tags!tags_parent_id_fkey(name), tag_aliases(alias), post_tags(count)")
    .in("id", ids);
  const candidates = (data ?? []).map((t) => ({
    id: t.id,
    kind: t.kind,
    name: t.name,
    slug: t.slug,
    parentName: (Array.isArray(t.parent) ? t.parent[0]?.name : (t.parent as { name: string } | null)?.name) ?? null,
    pending: t.status === "pending",
    aliases: t.tag_aliases.map((a) => a.alias),
    posts: t.post_tags[0]?.count ?? 0,
  }));
  return similarToName(name, candidates).map((t) => ({ id: t.id, kind: t.kind, name: t.name, slug: t.slug, parentName: t.parentName, pending: t.pending, reason: t.reason }));
}

/** 붙인 행사 태그의 장소 태그 (행사에 연결된 공식 장소만). 업로드 · 고치기 화면에서 "장소도 붙이기"로 권한다. */
export async function placesForEventTags(rawIds: string[]): Promise<TagOption[]> {
  const parsed = z.array(z.uuid()).max(10).safeParse(rawIds);
  if (!parsed.success || parsed.data.length === 0) return [];
  const viewer = await getViewer();
  if (!viewer?.profile?.can_upload) return [];
  const supabase = await createClient();
  const { data: events } = await supabase.from("events").select("place_tag_id").in("tag_id", parsed.data).eq("status", "official").not("place_tag_id", "is", null);
  const placeIds = [...new Set((events ?? []).map((e) => e.place_tag_id).filter((id): id is string => id !== null))];
  if (placeIds.length === 0) return [];
  const { data: places } = await supabase.from("tags").select("id, kind, name, slug").in("id", placeIds).eq("kind", "place").eq("status", "official");
  return (places ?? []).map((t) => ({ id: t.id, kind: t.kind, name: t.name, slug: t.slug, parentName: null, pending: false }));
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

  // 운영자 권한(바로 공식 태그)은 2단계 인증까지 마친 세션(aal2)에서만 DB가 허용한다. 아니면 일반 회원처럼 제안으로 만든다.
  const { data: claims } = await supabase.auth.getClaims();
  const isAdmin = viewer.profile.role === "admin" && claims?.claims.aal === "aal2";
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

/** 이미 올린 내 사진 중 비슷한 것 (업로드 화면 경고, A-02 ②). 들어온 순서대로 글 id 또는 null */
export async function findSimilarPhotos(hashes: string[]): Promise<(string | null)[]> {
  const input = Array.isArray(hashes) ? hashes.slice(0, 100) : [];
  const valid = input.flatMap((h, i) => (typeof h === "string" && /^[0-9a-f]{16}$/.test(h) ? [{ h, i }] : []));
  const none = input.map((): string | null => null);
  if (!valid.length) return none;
  const viewer = await getViewer();
  if (!viewer?.profile?.can_upload) return none;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_similar_photos", { hashes: valid.map((v) => v.h) });
  // DB는 넘긴 배열의 위치(1부터)로 답한다 → 원래 위치로 되돌린다
  for (const row of data ?? []) {
    const original = valid[row.idx - 1]?.i;
    if (original !== undefined) none[original] = row.post_id;
  }
  return none;
}
