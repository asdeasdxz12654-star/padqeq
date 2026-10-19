// 웹앱 설치 안내 (앱 대신 홈 화면에 추가 · 로드맵 2026-10-17). 기기 · 브라우저마다 설치하는 길이 다르다.
import { detectInAppBrowser } from "./in-app";

export type InstallMode =
  /** 이미 홈 화면에서 연 웹앱 */
  | "installed"
  /** 크롬 계열: 브라우저가 설치 창을 띄워 준다 (beforeinstallprompt) */
  | "prompt"
  /** 아이폰 · 아이패드 Safari: 공유 → 홈 화면에 추가 */
  | "ios-safari"
  /** 아이폰의 다른 브라우저: Safari에서 열어야 추가할 수 있다 */
  | "ios-other"
  /** 카카오톡 같은 앱 안 브라우저: 기본 브라우저에서 열어야 한다 */
  | "in-app"
  /** 그 밖 (PC 사파리 · 파이어폭스 등): 안내하지 않는다 */
  | "none";

export function installMode(userAgent: string, { standalone, canPrompt }: { standalone: boolean; canPrompt: boolean }): InstallMode {
  if (standalone) return "installed";
  if (detectInAppBrowser(userAgent)) return "in-app";
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent));
  if (ios) return /CriOS|FxiOS|EdgiOS|Whale|SamsungBrowser/i.test(userAgent) ? "ios-other" : "ios-safari";
  if (canPrompt) return "prompt";
  return "none";
}
