// 인앱 브라우저 감지 (S-20 ⑨). Google 로그인은 앱 안 브라우저(웹뷰)를 막기 때문에 기본 브라우저로 안내한다.

const APPS: [RegExp, string][] = [
  [/KAKAOTALK/i, "카카오톡"],
  [/NAVER\(inapp/i, "네이버"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV|FB_IAB/i, "페이스북"],
  [/\bLine\//i, "라인"],
  [/everytimeApp/i, "에브리타임"],
  [/DaumApps/i, "다음"],
  [/BAND\//i, "밴드"],
  [/Twitter/i, "X(트위터)"],
  [/Threads/i, "스레드"],
];

/** 인앱 브라우저면 앱 이름, 아니면 null */
export function detectInAppBrowser(userAgent: string): string | null {
  return APPS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

/** 기본 브라우저로 여는 주소 (만들 수 없으면 null → 링크 복사 안내) */
export function externalOpenUrl(userAgent: string, url: string): string | null {
  if (/KAKAOTALK/i.test(userAgent)) return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  if (/Android/i.test(userAgent)) {
    const { host, pathname, search, hash } = new URL(url);
    return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;end`;
  }
  return null;
}
