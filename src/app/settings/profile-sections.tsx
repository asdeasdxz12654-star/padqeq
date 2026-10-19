import Link from "next/link";
import { AdultConfirm } from "@/app/community/adult-confirm";
import { type CreatorDraft, CreatorForm } from "@/app/me/creator/creator-form";
import { AvatarForm } from "@/app/me/edit/avatar-form";
import { CoverPicker } from "@/app/me/edit/cover-picker";
import { ProfileForm } from "@/app/me/profile-form";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { createClient } from "@/lib/supabase/server";
import { currentYearKst } from "@/lib/year-chips";

/**
 * 설정 › 프로필 수정 (첫 탭): 프로필 사진 · 커버 · 이름 · 소개 · 링크 · 크리에이터 정보를 한 곳에서.
 * 예전에는 마이 › 프로필 고치기(/me/edit)와 마이 › 크리에이터 정보(/me/creator)로 나뉘어 있었다.
 */
export async function ProfileSections({ userId, handle, displayName }: { userId: string; handle: string; displayName: string }) {
  const supabase = await createClient();
  const [{ data: full }, recent, { data: creator }, { data: adult }] = await Promise.all([
    supabase.from("profiles").select("bio, links, cover_post_id, avatar_key").eq("id", userId).single(),
    // 커버로 고를 수 있는 내 사진 (최근 것부터)
    loadScopePage({ kind: "author", authorId: userId, year: null, month: null }),
    supabase.from("creator_profiles").select("listed, roles, region, active_since, works, casting_open").eq("user_id", userId).maybeSingle(),
    supabase.rpc("am_i_adult"),
  ]);
  const allowed = ["cosplayer", "photographer", "model", "retoucher"] as const;
  const initial: CreatorDraft = {
    listed: creator?.listed ?? true,
    roles: (creator?.roles ?? []).filter((r): r is (typeof allowed)[number] => (allowed as readonly string[]).includes(r)),
    region: creator?.region ?? "",
    activeSince: creator?.active_since ? String(creator.active_since) : "",
    works: creator?.works ?? "",
    castingOpen: creator?.casting_open ?? false,
  };
  const sub = "scroll-mt-28 text-base font-semibold";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h3 id="avatar-heading" className={sub}>
          프로필 사진
        </h3>
        <p className="-mt-2 text-sm text-quiet">올리지 않으면 빈 자리로 둬요.</p>
        <AvatarForm initial={full?.avatar_key ?? null} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 id="cover-heading" className={sub}>
          커버 사진
        </h3>
        <p className="-mt-2 text-sm text-quiet">프로필 맨 위에 넓게 걸리는 사진이에요. 고르지 않으면 걸지 않아요.</p>
        <CoverPicker posts={recent.items} initial={full?.cover_post_id ?? null} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 id="info-heading" className={sub}>
          이름 · 소개 · 링크
        </h3>
        <ProfileForm displayName={displayName} bio={full?.bio ?? ""} links={full?.links ?? []} />
        <p className="text-xs text-quiet">핸들(@{handle})은 크레딧 태그의 기준이라 바꿀 수 없어요.</p>
      </div>
      <div className="flex flex-col gap-3">
        <h3 id="creator-heading" className={sub}>
          크리에이터 정보
        </h3>
        <p className="-mt-2 text-sm leading-relaxed text-quiet">
          역할 · 지역 · 섭외 가능을 프로필과{" "}
          <Link href="/creators" className="underline underline-offset-2">
            크리에이터 찾기
          </Link>
          에 보여요. 직접 켠 경우에만 보이고, 언제든 끄거나 지울 수 있어요.
        </p>
        <CreatorForm initial={initial} exists={creator !== null} adult={Boolean(adult)} currentYear={currentYearKst()} />
        {!adult && <AdultConfirm reason="섭외 가능 표시 · 섭외 게시판은 만 19세 이상만 쓸 수 있어요." />}
      </div>
    </div>
  );
}
