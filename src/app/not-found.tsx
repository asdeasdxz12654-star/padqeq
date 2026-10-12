import Link from "next/link";

// 삭제 · 비공개 게시물도 존재 여부를 드러내지 않도록 같은 문구를 쓴다 (S-20)
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-bold">찾을 수 없는 페이지예요</h1>
      <p className="mt-2 text-quiet">주소가 바뀌었거나 삭제된 페이지예요.</p>
      <p className="mt-6 flex justify-center gap-4">
        <Link href="/" className="text-accent underline-offset-4 hover:underline">
          홈으로
        </Link>
        <Link href="/explore" className="text-accent underline-offset-4 hover:underline">
          검색하기
        </Link>
      </p>
    </div>
  );
}
