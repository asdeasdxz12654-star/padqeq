import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CollectionCards } from "@/components/collection-cards";
import { CollectionForm } from "@/components/collection-form";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { loadCollectionCards } from "@/lib/collections/load";

export const metadata: Metadata = { title: "내 컬렉션", robots: { index: false } };

// 내 컬렉션 (공개 · 나만 보기 모두). 게시물 화면의 '저장' 창에서 채운다.
export default async function MyCollectionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/collections"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/collections"));

  const items = await loadCollectionCards(viewer.id);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-8 pt-8 pb-16">
      <header className="flex flex-col gap-2 px-4 md:px-6">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이
        </Link>
        <h1 className="text-2xl font-bold">내 컬렉션</h1>
        <p className="text-sm text-quiet">내가 올린 글과 내가 크레딧된 글을 이름 붙인 묶음으로 모아요. 게시물 화면에서 담을 수 있어요.</p>
      </header>

      <details className="mx-4 rounded-xl border border-line p-4 md:mx-6 md:max-w-xl">
        <summary className="cursor-pointer font-semibold">새 컬렉션 만들기</summary>
        <div className="mt-4">
          <CollectionForm />
        </div>
      </details>

      <CollectionCards items={items} empty="아직 만든 컬렉션이 없어요." />
    </div>
  );
}
