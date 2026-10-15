import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { DeletionPanel } from "./deletion-panel";
import { MemoryAlertToggle } from "./memory-alert-toggle";
import { MessageSettings } from "./message-settings";
import { type ThemeChoice, ThemeForm } from "./theme-form";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "설정", robots: { index: false } };

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" });

// S-14 설정: 계정 정보 · 받은 경고 · 화면(테마) · 알림 · 메시지 받기 범위 · 차단 목록 · 내 데이터 내려받기 · 계정 삭제
export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/settings"));
  if (!viewer.profile) redirect(withNext("/welcome", "/settings"));

  const supabase = await createClient();
  const [{ data: claims }, { data: profile }, { data: setting }, { data: blocks }, { data: warnings }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("profiles").select("created_at, deletion_requested_at, memory_alerts").eq("id", viewer.id).single(),
    supabase.from("message_settings").select("receive").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("blocks").select("blocked:profiles!blocks_blocked_id_fkey(id, handle)").eq("blocker_id", viewer.id).limit(1000),
    // 받은 경고 (A-05 ⑥, 본인만 본다)
    supabase.from("member_warnings").select("id, reason, created_at").eq("member_id", viewer.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const blocked = (blocks ?? []).flatMap((b) => (b.blocked ? [b.blocked] : []));
  const savedTheme = (await cookies()).get("theme")?.value;
  const themeChoice: ThemeChoice = savedTheme === "light" || savedTheme === "system" ? savedTheme : "dark";
  const email = typeof claims?.claims.email === "string" ? claims.claims.email : null;

  return (
    <div className="mx-auto flex max-w-xl md:max-w-2xl flex-col gap-10 px-4 pt-10 pb-16 md:px-6">
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

      {warnings && warnings.length > 0 && (
        <section id="warnings" aria-labelledby="warnings-heading" className="flex scroll-mt-20 flex-col gap-3">
          <h2 id="warnings-heading" className="text-lg font-semibold">
            받은 경고
          </h2>
          <ul className="flex flex-col gap-2">
            {warnings.map((w) => (
              <li key={w.id} className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm">
                <p>{w.reason}</p>
                <p className="mt-1 text-xs text-quiet">{dayFormat.format(new Date(w.created_at))}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-quiet">
            같은 일이 되풀이되면 업로드 권한 회수나 이용 정지로 이어질 수 있어요. 이의가 있으면{" "}
            <Link href="/help" className="underline underline-offset-2">
              1:1 문의
            </Link>
            로 알려 주세요.
          </p>
        </section>
      )}

      <section aria-labelledby="theme-heading" className="flex flex-col gap-3">
        <h2 id="theme-heading" className="text-lg font-semibold">
          화면
        </h2>
        <ThemeForm current={themeChoice} />
      </section>

      <section aria-labelledby="alerts-heading" className="flex flex-col gap-3">
        <h2 id="alerts-heading" className="text-lg font-semibold">
          알림
        </h2>
        <MemoryAlertToggle initial={profile?.memory_alerts ?? true} />
      </section>

      <section id="messages" aria-labelledby="messages-heading" className="flex scroll-mt-20 flex-col gap-3">
        <h2 id="messages-heading" className="text-lg font-semibold">
          메시지 · 차단
        </h2>
        <MessageSettings receive={setting?.receive ?? "everyone"} blocked={blocked} />
      </section>

      <section aria-labelledby="data-heading" className="flex flex-col gap-3">
        <h2 id="data-heading" className="text-lg font-semibold">
          내 데이터
        </h2>
        <p className="text-sm leading-relaxed text-quiet">
          프로필 · 내 게시물 정보(제목 · 설명 · 촬영일 · 태그 · 크레딧) · 나를 태그한 크레딧 · 댓글 · 게시판 글 · 내가 보낸 메시지 · 신고 · 소명 · 문의 기록을 파일(JSON)로 받아요.
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
