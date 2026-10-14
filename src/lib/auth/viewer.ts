import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { isActiveRestriction } from "@/lib/moderation/sanctions";

export type Viewer = {
  id: string;
  /** 소셜 로그인에서 받은 이름 (가입 화면 기본값) */
  suggestedName: string;
  /** 가입(핸들 입력)을 마치지 않았으면 null */
  profile: Pick<Tables<"profiles">, "handle" | "display_name" | "role" | "can_upload"> | null;
  /** 지금 이용 정지 중이면 기간 · 사유 (본인만 보는 정보). 정지 중에는 profile.can_upload도 false */
  restriction: { until: string; reason: string } | null;
};

/**
 * 지금 요청의 로그인 사용자. 서명을 검증한 토큰(getClaims)만 믿는다.
 * 한 요청 안에서 여러 번 불러도 한 번만 조회한다.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const { sub, user_metadata: meta } = data.claims;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("handle, display_name, role, can_upload, restriction:member_restrictions(suspended_until, reason)")
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

  return {
    id: sub,
    suggestedName,
    profile: profile && { handle: profile.handle, display_name: profile.display_name, role: profile.role, can_upload: profile.can_upload && !restriction },
    restriction,
  };
});
