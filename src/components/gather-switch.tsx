import Link from "next/link";

/** 휴대폰: 아래 탭 '행사' 안에서 행사 캘린더 ↔ 커뮤니티 전환 (PC는 상단 메뉴에 둘 다 있다) */
export function GatherSwitch({ current }: { current: "events" | "community" }) {
  const item = (href: string, label: string, on: boolean) => (
    <Link
      prefetch={false}
      href={href}
      aria-current={on ? "page" : undefined}
      className="flex min-h-10 flex-1 items-center justify-center rounded-lg text-sm text-quiet aria-[current=page]:bg-bg aria-[current=page]:font-bold aria-[current=page]:text-text aria-[current=page]:shadow-sm"
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="행사 · 커뮤니티" className="mb-5 flex gap-1 rounded-xl bg-surface p-1 md:hidden">
      {item("/events", "행사", current === "events")}
      {item("/community", "커뮤니티", current === "community")}
    </nav>
  );
}
