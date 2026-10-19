import Link from "next/link";
import { LineArt } from "./line-art";

/** 빈 화면: 로고와 같은 펜 선 그림 + 한 줄 + (있으면) 다음에 할 일 하나 (보드 16 '해담 일러스트 세트') */
export function EmptyState({ text, action, className = "" }: { text: string; action?: { href: string; label: string }; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 px-4 py-12 text-center ${className}`}>
      <LineArt kind="empty" />
      <p className="max-w-sm text-sm leading-relaxed text-quiet">{text}</p>
      {action && (
        <Link prefetch={false} href={action.href} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold hover:border-quiet">
          {action.label}
        </Link>
      )}
    </div>
  );
}
