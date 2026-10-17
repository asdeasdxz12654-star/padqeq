import type { CommentPolicy, Visibility } from "@/lib/posts/audience";

// 업로드 공개 설정의 '지난번 값' (공개 범위 · 댓글 · 촬영 정보 표시). 이 기기 브라우저에만 저장한다.
// 예약 · 가림은 글마다 다르므로 기억하지 않는다. 저장소를 못 쓰면(사생활 보호 모드 등) 기본값.

const KEY = "haedam:upload-audience";

export type AudienceDefaults = { visibility: Visibility; commentPolicy: CommentPolicy; showExif: boolean };
const FALLBACK: AudienceDefaults = { visibility: "public", commentPolicy: "everyone", showExif: true };

export function loadAudienceDefaults(): AudienceDefaults {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return FALLBACK;
    const v = JSON.parse(raw) as Partial<AudienceDefaults>;
    return {
      visibility: typeof v.visibility === "string" ? (v.visibility as Visibility) : FALLBACK.visibility,
      commentPolicy: typeof v.commentPolicy === "string" ? (v.commentPolicy as CommentPolicy) : FALLBACK.commentPolicy,
      showExif: typeof v.showExif === "boolean" ? v.showExif : FALLBACK.showExif,
    };
  } catch {
    return FALLBACK;
  }
}

export function rememberAudience(patch: Partial<AudienceDefaults>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadAudienceDefaults(), ...patch }));
  } catch {
    // 저장소를 못 쓰면 이번에만 적용
  }
}
