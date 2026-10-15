import "server-only";
import { escapeLike } from "@/lib/posts/feed-params";
import { createClient } from "@/lib/supabase/server";

// 탐색 검색 결과 탭(S-04 ①)과 입력 중 추천(S-03 ①)이 같은 규칙으로 찾는다. 볼 수 있는 것만 (RLS).

/** 이름이나 다른 표기(별칭)에 검색어가 들어간 태그. 작품 › 캐릭터는 작품 이름도 함께. */
export async function findTags(text: string, limit = 8) {
  const supabase = await createClient();
  const pattern = `%${escapeLike(text)}%`;
  const [byName, byAlias] = await Promise.all([
    supabase.from("tags").select("id").ilike("name", pattern).limit(limit),
    supabase.from("tag_aliases").select("tag_id").ilike("alias", pattern).limit(limit),
  ]);
  const ids = [...new Set([...(byName.data ?? []).map((r) => r.id), ...(byAlias.data ?? []).map((r) => r.tag_id)])];
  if (!ids.length) return [];
  const { data } = await supabase
    .from("tags")
    .select("id, slug, name, kind, parent:tags!tags_parent_id_fkey(name)")
    .in("id", ids.slice(0, limit))
    .order("name");
  return (data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    kind: t.kind,
    // 자기 참조 관계라 타입은 배열로 추론된다 (실제로는 하나)
    parentName: (Array.isArray(t.parent) ? t.parent[0]?.name : (t.parent as { name: string } | null)?.name) ?? null,
  }));
}

/** 핸들 앞부분 · 표시 이름 일부로 회원 찾기 (탈퇴 유예 · 차단은 RLS가 뺀다) */
export async function findCreators(text: string, limit = 30) {
  // PostgREST 필터 문법 문자는 지운다 (검색어가 조건을 바꾸지 못하게)
  const like = escapeLike(text.replace(/^@/, "").replace(/[,()*:."']/g, ""));
  if (!like) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("handle, display_name")
    .or(`handle.ilike.${like}*,display_name.ilike.*${like}*`)
    .order("handle")
    .limit(limit);
  return data ?? [];
}

/** 이름으로 공식 행사 찾기 (최근 것부터) */
export async function findEvents(text: string, limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, name, starts_on, ends_on")
    .eq("status", "official")
    .ilike("name", `%${escapeLike(text)}%`)
    .order("starts_on", { ascending: false })
    .limit(limit);
  return data ?? [];
}
