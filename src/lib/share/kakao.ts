// 카카오톡 공유 (Kakao JavaScript SDK). 누를 때만 불러온다 (평소 화면에는 영향 없음).
// 버전 · 무결성 값은 고정한다 (2.8.3, kakaocdn에서 받은 파일의 sha384). 2.8.4는 2026-10-19 배포라 한 단계 앞을 쓴다.
// 공유 내용은 링크의 미리보기(Open Graph: 제목 · 설명 · 공유 그림)를 카카오가 읽어 만든다(sendScrap) — 사진은 보내지 않는다.

const SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js";
const SDK_INTEGRITY = "sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy";

/** 카카오 앱 › 플랫폼 키 › JavaScript 키 (공개 값, JavaScript SDK 도메인으로 쓸 곳이 제한된다). 없으면 카카오톡 공유를 숨긴다. */
export const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

type KakaoSdk = {
  isInitialized(): boolean;
  init(key: string): void;
  Share: { sendScrap(options: { requestUrl: string }): void };
};
declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let loading: Promise<KakaoSdk> | null = null;

function loadSdk(): Promise<KakaoSdk> {
  if (window.Kakao) return Promise.resolve(window.Kakao);
  loading ??= new Promise<KakaoSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.integrity = SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => (window.Kakao ? resolve(window.Kakao) : reject(new Error("kakao_sdk_missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("kakao_sdk_failed"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** 이 주소를 카카오톡으로 보낸다 (친구 · 채팅방 고르기 화면이 열린다) */
export async function shareToKakao(url: string): Promise<void> {
  const kakao = await loadSdk();
  if (!kakao.isInitialized()) kakao.init(KAKAO_JS_KEY);
  kakao.Share.sendScrap({ requestUrl: url });
}
