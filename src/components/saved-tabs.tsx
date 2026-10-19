import Link from "next/link";

/** 저장 · 컬렉션 (마이페이지의 한 칸): 저장함과 내 컬렉션을 위 탭으로 오간다 */
export function SavedTabs({ current }: { current: "saved" | "collections" }) {
  const tab = "inline-flex min-h-10 items-center border-b-2 border-transparent px-1 text-sm aria-[current=page]:border-text aria-[current=page]:font-semibold";
  return (
    <nav aria-label="저장 · 컬렉션" className="flex gap-6 border-b border-line">
      <Link href="/me/saved" aria-current={current === "saved" ? "page" : undefined} className={tab}>
        저장한 사진
      </Link>
      <Link href="/me/collections" aria-current={current === "collections" ? "page" : undefined} className={tab}>
        내 컬렉션
      </Link>
    </nav>
  );
}
