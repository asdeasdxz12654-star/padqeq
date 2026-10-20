import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { createClient } from "@/lib/supabase/server";
import { currentYearKst } from "@/lib/year-chips";
import { type CreatorDraft, ProfileEditor } from "./profile-editor";

/**
 * 설정 › 프로필 수정 (첫 탭): 프로필 사진 · 커버 · 이름 · 소개 · 링크 · 크리에이터 정보를 한 곳에서, 저장은 한 번에.
 * 예전에는 마이 › 프로필 고치기(/me/edit)와 마이 › 크리에이터 정보(/me/creator)로 나뉘어 있었다.
 */
export async function ProfileSections({ userId, handle, displayName }: { userId: string; handle: string; displayName: string }) {
  const supabase = await createClient();
  const [{ data: full }, recent, { data: creator }] = await Promise.all([
    supabase.from("profiles").select("bio, links, cover_post_id, avatar_key").eq("id", userId).single(),
    // 커버로 고를 수 있는 내 사진 (최근 것부터)
    loadScopePage({ kind: "author", authorId: userId, year: null, month: null }),
    supabase.from("creator_profiles").select("listed, roles, region, active_since, works, casting_open").eq("user_id", userId).maybeSingle(),
  ]);
  const allowed = ["cosplayer", "photographer", "model", "retoucher"] as const;
  const draft: CreatorDraft = {
    listed: creator?.listed ?? true,
    roles: (creator?.roles ?? []).filter((r): r is (typeof allowed)[number] => (allowed as readonly string[]).includes(r)),
    region: creator?.region ?? "",
    activeSince: creator?.active_since ? String(creator.active_since) : "",
    works: creator?.works ?? "",
    castingOpen: creator?.casting_open ?? false,
  };

  return (
    <div className="flex flex-col gap-4">
      <ProfileEditor
        handle={handle}
        initial={{
          avatarKey: full?.avatar_key ?? null,
          coverPostId: full?.cover_post_id ?? null,
          displayName,
          bio: full?.bio ?? "",
          links: full?.links ?? [],
          creator: draft,
          creatorExists: creator !== null,
        }}
        posts={recent.items}
        currentYear={currentYearKst()}
      />
    </div>
  );
}
