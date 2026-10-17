// 해담 로고: 살짝 기울어진 인화 사진 안, 산 위로 뜨는 해 (펜 선 그림).
// 작은 크기용이라 안쪽 사진 칸 · 날짜 메모는 빼고 테두리 · 해 · 산 세 가지만 굵게 그린다.
// 선은 글자색(currentColor), 해는 그림용 빨강(--sun)이라 다크 테마에서도 그대로 맞는다.

export function HaedamMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size * (120 / 136)} height={size} viewBox="0 0 120 136" aria-hidden="true" className={className}>
      <g transform="rotate(-5 60 68)">
        <path
          d="M16 12 C40 10, 80 13, 104 11 C106 50, 103 90, 105 124 C78 126, 42 124, 15 125 C17 90, 14 50, 16 12 Z"
          fill="var(--bg)"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <circle cx="68" cy="50" r="16" fill="var(--sun)" />
        <path
          d="M26 86 C36 70, 44 66, 52 75 C58 62, 68 60, 80 73 C86 69, 92 71, 96 78"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** 상단바 로고: 그림 + '해담' */
export function HaedamLogo() {
  return (
    <span className="flex items-center gap-2">
      <HaedamMark size={26} />
      <span className="text-lg font-bold tracking-tight">해담</span>
    </span>
  );
}
