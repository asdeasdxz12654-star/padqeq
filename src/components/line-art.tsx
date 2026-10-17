// 해담 선 그림: 로고와 같은 펜 선(먹색) + 해(빨강) 한 점. 빈 화면 · 오류 · 찾을 수 없음에 쓴다.
// 장식이라 화면 읽기 프로그램에는 읽히지 않는다 (aria-hidden).

type Kind = "empty" | "notfound" | "error";

export function LineArt({ kind, className = "" }: { kind: Kind; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 100" className={`h-24 w-28 text-text ${className}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* 기울어진 인화 사진 */}
      <g transform={kind === "notfound" ? "rotate(8 60 50)" : "rotate(-5 60 50)"}>
        <path d="M30 14 C48 12, 74 15, 92 13 C94 38, 92 62, 94 86 C74 88, 48 86, 29 87 C31 62, 28 38, 30 14 Z" strokeWidth="3" fill="var(--bg)" />
        {kind === "empty" && (
          <>
            <circle cx="70" cy="36" r="8" fill="var(--sun)" stroke="none" />
            <path d="M36 66 C44 54, 50 51, 56 57 C61 48, 69 47, 78 56 C82 53, 85 54, 88 58" strokeWidth="2.6" />
          </>
        )}
        {kind === "notfound" && (
          <>
            <circle cx="61" cy="40" r="8" stroke="var(--sun)" strokeWidth="2.6" strokeDasharray="3 4" />
            <path d="M44 70 L78 70" strokeWidth="2.6" strokeDasharray="5 6" />
          </>
        )}
        {kind === "error" && (
          <>
            <circle cx="70" cy="34" r="7" fill="var(--sun)" stroke="none" />
            <path d="M42 48 C42 42, 50 40, 54 44 C56 38, 66 38, 68 45 C74 44, 76 52, 70 54 L45 54 C40 54, 39 49, 42 48 Z" strokeWidth="2.4" fill="var(--bg)" />
            <path d="M48 62 L45 70 M58 62 L55 70 M68 62 L65 70" strokeWidth="2.2" />
          </>
        )}
      </g>
    </svg>
  );
}
