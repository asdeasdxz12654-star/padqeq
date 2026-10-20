import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DeletionPanel } from "../deletion-panel";
import { settingsViewer } from "../load";

export const metadata: Metadata = { title: "내 데이터 · 탈퇴 · 설정", robots: { index: false } };

// 설정 › 내 데이터 · 탈퇴: 내 데이터 내려받기 · 계정 삭제
export default async function SettingsDataPage() {
  const viewer = await settingsViewer("/settings/data");
  const supabase = await createClient();
  const { data: account } = await supabase.from("profiles").select("deletion_requested_at").eq("id", viewer.id).single();

  return (
    <>
      <section aria-labelledby="data-heading" className="flex flex-col gap-3">
        <h1 id="data-heading" className="text-lg font-semibold">
          내 데이터
        </h1>
        <p className="text-sm leading-relaxed text-quiet">
          프로필 · 내 게시물 정보(제목 · 설명 · 촬영일 · 태그 · 크레딧) · 나를 태그한 크레딧 · 댓글 · 게시판 글 · 내가 보낸 메시지 · 신고 · 소명 · 문의 기록을 파일(JSON)로 받아요.
        </p>
        <a href="/api/me/export" download className="min-h-11 self-start rounded-xl border border-line px-5 py-2.5 text-sm font-semibold hover:border-quiet">
          내 데이터 내려받기
        </a>
      </section>

      <section id="delete" aria-labelledby="delete-heading" className="flex scroll-mt-28 flex-col gap-3 border-t border-line pt-8">
        <h2 id="delete-heading" className="text-lg font-semibold">
          계정 삭제
        </h2>
        <DeletionPanel handle={viewer.profile.handle} requestedAt={account?.deletion_requested_at ?? null} />
      </section>
    </>
  );
}
