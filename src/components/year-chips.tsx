import Link from "next/link";
import type { YearChips as Chips } from "@/lib/year-chips";

const chip = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap";
const on = "border-text bg-text text-bg font-semibold";
const off = "border-line text-text hover:border-quiet";

/** 연도 칩. 선택은 ?year= 주소로 표현해 공유·뒤로 가기가 그대로 동작한다. */
export function YearChips({ chips, selected }: { chips: Chips; selected: number | null }) {
  const olderSelected = selected !== null && chips.older.includes(selected);

  return (
    <nav aria-label="촬영 연도">
      <ul className="flex items-center gap-2 overflow-x-auto px-4 py-3 md:px-6 [scrollbar-width:none]">
        <li>
          <Link href="/" aria-current={selected === null ? "page" : undefined} className={`${chip} ${selected === null ? on : off}`}>
            전체
          </Link>
        </li>
        {chips.visible.map((year) => (
          <li key={year}>
            <Link
              href={`/?year=${year}`}
              aria-current={selected === year ? "page" : undefined}
              className={`${chip} ${selected === year ? on : off}`}
            >
              {year}
            </Link>
          </li>
        ))}
        {chips.older.length > 0 && (
          <li className="relative">
            <details className="group">
              <summary className={`${chip} ${olderSelected ? on : off} cursor-pointer list-none`}>
                {olderSelected ? selected : "이전"} <span aria-hidden="true" className="ml-1">▾</span>
              </summary>
              <ul className="absolute left-0 z-20 mt-2 min-w-28 rounded-xl border border-line bg-surface p-1 shadow-lg">
                {chips.older.map((year) => (
                  <li key={year}>
                    <Link
                      href={`/?year=${year}`}
                      aria-current={selected === year ? "page" : undefined}
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-slot"
                    >
                      {year}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        )}
      </ul>
    </nav>
  );
}
