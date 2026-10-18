import Link from "next/link";
import { TONE_LABEL, TONE_SWATCH, TONES, type Tone } from "@/lib/photos/tone";

/** 색감 칩 줄 (탐색 · 색감 화면) */
export function ToneChips({ selected }: { selected: Tone | null }) {
  return (
    <nav aria-label="색감으로 찾기">
      <ul className="flex gap-2 overflow-x-auto px-4 pt-3 md:px-6 [scrollbar-width:none]">
        {TONES.map((t) => (
          <li key={t}>
            <Link
              prefetch={false}
              href={`/tone?pick=${t}`}
              aria-current={selected === t ? "page" : undefined}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm whitespace-nowrap hover:border-quiet aria-[current=page]:border-text aria-[current=page]:font-semibold"
            >
              <span aria-hidden="true" className="size-3 rounded-full border border-line" style={{ backgroundColor: TONE_SWATCH[t] }} />
              {TONE_LABEL[t]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
