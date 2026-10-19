// Supabase Auth 오류 코드 → 화면 문구.

const MESSAGES: Record<string, string> = {
  over_request_rate_limit: "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.",
  provider_disabled: "지금은 이 방법으로 로그인할 수 없어요.",
  signup_disabled: "지금은 새로 가입할 수 없어요.",
  user_banned: "이용이 제한된 계정이에요. 고객센터로 문의해 주세요.",
};

const FALLBACK = "잠시 문제가 생겼어요. 다시 시도해 주세요.";

export function authErrorMessage(error: { code?: string | undefined } | null | undefined): string {
  return (error?.code && MESSAGES[error.code]) || FALLBACK;
}

/** /login?error= 값 (콜백에서 실패했을 때) */
export const CALLBACK_ERRORS: Record<string, string> = {
  oauth: "로그인을 마치지 못했어요. 다시 시도해 주세요.",
  expired: "로그인 시간이 지났어요. 다시 시도해 주세요.",
  session: "로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.",
};
