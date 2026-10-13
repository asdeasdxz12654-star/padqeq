import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { DeletionPanel } from "./deletion-panel";

export const metadata: Metadata = { title: "설정", robots: { index: false } };

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" });

// S-14 설정 (1단계: 계정 정보 · 내 데이터 내려받기 · 계정 삭제)
// 콘텐츠 보기 · 업로드 기본값 · 크레딧 자동 승인 · 메시지 설정은 해당 기능과 함께.
export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/settings"));
  if (!viewer.profile) redirect(withNext("/welcome", "/settings"));

  const supabase = await createClient();
  const [{ data: claims }, { data: profile }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("profiles").select("created_at, deletion_requested_at").eq("id", viewer.id).single(),
  ]);
  const email = typeof claims?.claims.email === "string" ? claims.claims.email : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-10 px-4 pt-10 pb-16 md:px-6">
      <header className="flex items-center gap-3">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이
        </Link>
        <h1 className="text-2xl font-bold">설정</h1>
      </header>

      <section aria-labelledby="account-heading" className="flex flex-col gap-3">
        <h2 id="account-heading" className="text-lg font-semibold">
          계정
        </h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-quiet">핸들</dt>
          <dd>@{viewer.profile.handle}</dd>
          <dt className="text-quiet">이메일</dt>
          <dd className="break-all">{email ?? "-"}</dd>
          <dt className="text-quiet">로그인</dt>
          <dd>Google 계정</dd>
          <dt className="text-quiet">가입일</dt>
          <dd>{profile ? dayFormat.format(new Date(profile.created_at)) : "-"}</dd>
        </dl>
      </section>

      <section aria-labelledby="data-heading" className="flex flex-col gap-3">
        <h2 id="data-heading" className="text-lg font-semibold">
          내 데이터
        </h2>
        <p className="text-sm leading-relaxed text-quiet">
          프로필 · 내 게시물 정보(제목 · 설명 · 촬영일 · 태그 · 크레딧) · 나를 태그한 크레딧 · 내가 한 신고 · 소명 기록을 파일(JSON)로 받아요.
        </p>
        <a
          href="/api/me/export"
          download
          className="min-h-11 self-start rounded-xl border border-line px-5 py-2.5 text-sm font-semibold hover:border-quiet"
        >
          내 데이터 내려받기
        </a>
      </section>

      <section aria-labelledby="delete-heading" className="flex flex-col gap-3">
        <h2 id="delete-heading" className="text-lg font-semibold">
          계정 삭제
        </h2>
        <DeletionPanel handle={viewer.profile.handle} requestedAt={profile?.deletion_requested_at ?? null} />
      </section>

      <nav aria-label="정책" className="flex gap-4 border-t border-line pt-6 text-sm text-quiet">
        <Link href="/terms" className="hover:text-text">
          이용약관
        </Link>
        <Link href="/privacy" className="font-semibold hover:text-text">
          개인정보처리방침
        </Link>
      </nav>
    </div>
  );
}
