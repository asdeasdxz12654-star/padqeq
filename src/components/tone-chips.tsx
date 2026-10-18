import Link from "next/link";
import { TONE_LABEL, TONE_SWATCH, TONES, type Tone } from "@/lib/photos/tone";

/**
 * 색감 칩 줄 (탐색 · 색감 화면).
 * 칩만 있으면 무엇을 고르는 줄인지 알 수 없어 제목 한 줄을 함께 둔다.
 * `heading`을 끄면 이미 제목이 있는 색감 화면에서 겹치지 않는다.
 */
export function ToneChips({ selected, heading = true }: { selected: Tone | null; heading?: boolean }) {
  return (
    <nav aria-label="색감으로 찾기" className="pt-3">
      {heading && (
        <p className="px-4 text-sm font-semibold md:px-6">
          색감으로 찾기 <span className="font-normal text-quiet">· 표지 사진의 대표 색으로 모아 봐요</span>
        </p>
      )}
      <ul className="flex gap-2 overflow-x-auto px-4 pt-2 md:px-6 [scrollbar-width:none]">
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
