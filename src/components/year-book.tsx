import { Nanum_Pen_Script } from "next/font/google";
import Link from "next/link";

// 연도 손글씨 (책장 · 속표지에서만 받는다)
const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });

export type BookMonth = { month: number; posts: number; photos: number };

/**
 * 연도 책 속표지 (시안 23): 책장에서 한 해를 펼치면 먼저 나오는 장.
 * 그해의 숫자와 가장 많이 찍은 달, 그리고 달 목차. 목차를 누르면 그 달 사진만 본다.
 * 아래로는 그해(또는 그 달) 사진이 이어진다 — 펼친 책의 오른쪽 장에 해당한다.
 */
export function YearBook({
  handle,
  year,
  photos,
  events,
  partners,
  months,
  selectedMonth,
  hrefFor,
}: {
  handle: string;
  year: number;
  photos: number;
  events: number;
  partners: number;
  months: BookMonth[];
  selectedMonth: number | null;
  hrefFor(month: number | null): string;
}) {
  const busiest = months.reduce<BookMonth | null>((top, m) => (!top || m.photos > top.photos ? m : top), null);

  return (
    <section aria-labelledby="book-heading" className="border-b border-line px-4 pt-5 pb-5 md:px-6">
      <h2 id="book-heading" className={`${pen.className} text-5xl leading-none`}>
        {year}
      </h2>
      <p className="mt-1 text-sm text-quiet">@{handle}의 한 해</p>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
        {[
          { n: photos, unit: "장을 담았어요" },
          { n: events, unit: "번의 행사" },
          { n: partners, unit: "명과 함께" },
        ]
          .filter((s) => s.n > 0)
          .map((s) => (
            <div key={s.unit} className="flex flex-col">
              <dt className="sr-only">{s.unit}</dt>
              <dd className="text-2xl font-bold tabular-nums md:text-3xl">{s.n.toLocaleString("ko-KR")}</dd>
              <span className="text-xs text-quiet">{s.unit}</span>
            </div>
          ))}
      </dl>

      {busiest && months.length > 1 && (
        <p className={`${pen.className} mt-4 text-2xl leading-tight text-quiet`}>가장 많이 찍은 달 — {busiest.month}월</p>
      )}

      {months.length > 0 && (
        <nav aria-label="달 목차" className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="mr-2 text-xs text-quiet">목차</span>
          <Link
            href={hrefFor(null)}
            aria-current={selectedMonth === null ? "page" : undefined}
            className="inline-flex min-h-9 items-center rounded-full px-2.5 text-sm text-quiet hover:text-text aria-[current=page]:bg-text aria-[current=page]:font-semibold aria-[current=page]:text-bg"
          >
            한 해 전체
          </Link>
          {months.map((m) => (
            <Link
              key={m.month}
              href={hrefFor(m.month)}
              aria-current={selectedMonth === m.month ? "page" : undefined}
              aria-label={`${m.month}월 · 사진 ${m.photos}장`}
              className="inline-flex min-h-9 items-center rounded-full px-2.5 text-sm text-quiet hover:text-text aria-[current=page]:bg-text aria-[current=page]:font-semibold aria-[current=page]:text-bg"
            >
              {m.month}월
              <span className="ml-1 text-xs tabular-nums opacity-70">{m.photos}</span>
            </Link>
          ))}
        </nav>
      )}
    </section>
  );
}
