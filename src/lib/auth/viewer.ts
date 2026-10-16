import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { isActiveRestriction } from "@/lib/moderation/sanctions";
import { getSiteSwitches } from "@/lib/support/switches";
import { isStaffRole } from "./roles";

export type Viewer = {
  id: string;
  /** 소셜 로그인에서 받은 이름 (가입 화면 기본값) */
  suggestedName: string;
  /** 가입(핸들 입력)을 마치지 않았으면 null */
  profile: Pick<Tables<"profiles">, "handle" | "display_name" | "role" | "can_upload"> | null;
  /** 지금 이용 정지 중이면 기간 · 사유 (본인만 보는 정보). 정지 중에는 profile.can_upload도 false */
  restriction: { until: string; reason: string } | null;
  /**
   * 운영자(최고 관리자 · 운영 도우미) 계정이지만 이 세션이 2단계 인증을 마치지 않음(aal1).
   * 이때 profile.role은 'member'로 내려 운영 화면 · 기능을 감춘다 (DB도 aal2가 아니면 운영자 권한을 주지 않는다).
   */
  mfaRequired: boolean;
  /** 가림 표시 사진을 가리지 않고 바로 본다 (설정) */
  showVeiled: boolean;
};

/**
 * 지금 요청의 로그인 사용자. 서명을 검증한 토큰(getClaims)만 믿는다.
 * 한 요청 안에서 여러 번 불러도 한 번만 조회한다.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const { sub, user_metadata: meta, aal } = data.claims;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "handle, display_name, role, can_upload, upload_revoked_at, show_veiled, restriction:member_restrictions!member_restrictions_member_id_fkey(suspended_until, reason)",
    )
    .eq("id", sub)
    .maybeSingle();
  if (profileError) throw profileError;

  const suggestedName =
    [meta?.full_name, meta?.name, meta?.nickname, meta?.preferred_username]
      .find((v): v is string => typeof v === "string" && v.trim().length > 0)
      ?.trim()
      .slice(0, 40) ?? "";

  // 기간이 지난 정지는 DB에서도 효력이 없다 (매일 정리 작업이 지운다)
  const restricted = profile?.restriction && isActiveRestriction(profile.restriction.suspended_until) ? profile.restriction : null;
  const restriction = restricted ? { until: restricted.suspended_until, reason: restricted.reason } : null;

  const mfaRequired = isStaffRole(profile?.role) && aal !== "aal2";
  // 업로드 권한: 받은 권한, 또는 개방 단계(회수당하지 않은 회원). 정지 중이면 없음. (DB의 private.can_upload()와 같은 규칙)
  const stage = profile ? (await getSiteSwitches()).uploadStage : "solo";
  const canUpload = Boolean(profile) && (profile!.can_upload || (stage === "open" && !profile!.upload_revoked_at)) && !restriction;

  return {
    id: sub,
    suggestedName,
    profile: profile && {
      handle: profile.handle,
      display_name: profile.display_name,
      role: mfaRequired ? "member" : profile.role,
      can_upload: canUpload,
    },
    restriction,
    mfaRequired,
    showVeiled: Boolean(profile?.show_veiled),
  };
});
