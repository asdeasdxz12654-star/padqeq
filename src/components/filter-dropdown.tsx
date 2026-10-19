import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 필터 한 줄 안의 접는 목록 (탐색: 색감 · 촬영 연도). 누르면 아래로 작은 목록이 열리고, 고르면 주소가 바뀐다.
 * 고른 값이 있으면 버튼에 함께 보인다. 자바스크립트 없이 동작한다 (details).
 */
export function FilterDropdown({
  label,
  value,
  options,
}: {
  label: string;
  /** 지금 고른 값 이름 (없으면 null) */
  value: string | null;
  options: { key: string; label: ReactNode; href: string; current: boolean }[];
}) {
  const on = value !== null;
  return (
    <details className="group relative">
      <summary
        className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap [&::-webkit-details-marker]:hidden ${
          on ? "border-text bg-text font-semibold text-bg" : "border-line hover:border-quiet"
        }`}
      >
        {label}
        {on && ` · ${value}`}
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul className="absolute left-0 z-30 mt-2 max-h-80 min-w-40 overflow-y-auto rounded-xl border border-line bg-bg p-1 shadow-lg">
        {options.map((o) => (
          <li key={o.key}>
            <Link
              prefetch={false}
              href={o.href}
              aria-current={o.current ? "page" : undefined}
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap hover:bg-surface aria-[current=page]:font-semibold"
            >
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
