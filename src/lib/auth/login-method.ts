// 로그인 방법 (Supabase 토큰의 app_metadata.provider). 설정 화면 · 가입 동의 문구에 쓴다.

export type LoginMethod = "kakao" | "naver" | "google";

export const LOGIN_METHOD_LABEL: Record<LoginMethod, string> = { kakao: "카카오 계정", naver: "네이버 계정", google: "Google 계정" };

/** 가입 때 알리는 수집 항목 (개인정보처리방침 1항과 같게) */
export const LOGIN_METHOD_ITEMS: Record<LoginMethod, string> = {
  kakao: "카카오 회원 번호 · 닉네임, 동의한 경우 프로필 사진 · 이메일",
  naver: "네이버 회원 식별값(서비스마다 다른 번호)",
  google: "Google 계정의 이메일 · 이름",
};

export function parseLoginMethod(value: unknown): LoginMethod | null {
  // 네이버는 직접 연결한 로그인이라 'custom:naver'로 온다
  if (value === "custom:naver") return "naver";
  return value === "kakao" || value === "google" ? value : null;
}
