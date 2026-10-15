import type { Metadata } from "next";
import Form from "next/form";
import { notFound } from "next/navigation";
import { isStaffRole } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { MfaGate } from "./mfa-gate";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// 운영 화면. 운영진(최고 관리자 · 운영 도우미)이 아니면 화면이 있다는 것도 드러내지 않는다 (404).
// 운영 도우미는 신고 처리 · 회원(경고)만, 나머지 화면은 requireTopAdmin()이 막는다.
// 실제 권한은 DB(RLS · moderate_post)가 다시 확인한다.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await getViewer();
  // 운영자 계정이지만 2단계 인증 전이면 인증 화면만 보여 준다 (그 밖의 사람에게는 화면이 있다는 것도 숨김)
  if (viewer?.mfaRequired) return <MfaGate />;
  if (!isStaffRole(viewer?.profile?.role)) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-16 md:px-6">
      {/* 운영 전체 검색 (A-01 ③): 모든 운영 화면 위 */}
      <Form action="/admin/search" role="search" className="mb-6 flex gap-2 md:ml-auto md:w-96">
        <label className="sr-only" htmlFor="admin-q">
          운영 검색
        </label>
        <input
          id="admin-q"
          name="q"
          type="search"
          maxLength={60}
          enterKeyHint="search"
          autoComplete="off"
          placeholder="게시물 ID · 신고 번호 · @핸들 · 제목 · 태그"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
        />
        <button type="submit" className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm hover:border-quiet">
          찾기
        </button>
      </Form>
      {children}
    </div>
  );
}
