import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { DeletionPanel } from "./deletion-panel";
import { MessageSettings } from "./message-settings";
import { InterestPicker } from "./interest-picker";
import { PushSettings } from "./push-settings";
import { SettingToggle } from "./setting-toggle";
import { type ThemeChoice, ThemeForm } from "./theme-form";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "설정", robots: { index: false } };

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" });

// S-14 설정: 계정 정보 · 받은 경고 · 화면(테마) · 관심 분야 · 알림 · 웹 푸시 · 크레딧 자동 승인 · 메시지 받기 범위 · 차단 목록 · 내 데이터 내려받기 · 계정 삭제
export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/settings"));
  if (!viewer.profile) redirect(withNext("/welcome", "/settings"));

  const supabase = await createClient();
  const [{ data: claims }, { data: account }, { data: mine }, { data: setting }, { data: blocks }, { data: warnings }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("profiles").select("created_at, deletion_requested_at").eq("id", viewer.id).single(),
    // 개인 설정 열은 본인 전용 함수로 읽는다
    supabase.rpc("my_settings"),
    supabase.from("message_settings").select("receive").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("blocks").select("blocked:profiles!blocks_blocked_id_fkey(id, handle)").eq("blocker_id", viewer.id).limit(1000),
    // 받은 경고 (A-05 ⑥, 본인만 본다)
    supabase.from("member_warnings").select("id, reason, created_at").eq("member_id", viewer.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const profile = account && { ...account, ...mine?.[0] };
  const blocked = (blocks ?? []).flatMap((b) => (b.blocked ? [b.blocked] : []));
  const savedTheme = (await cookies()).get("theme")?.value;
  const themeChoice: ThemeChoice = savedTheme === "dark" || savedTheme === "system" ? savedTheme : "light";
  const email = typeof claims?.claims.email === "string" ? claims.claims.email : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 md:grid md:grid-cols-[180px_minmax(0,1fr)] md:gap-10 md:px-6">
      <nav aria-label="설정 목차" className="sticky top-14 z-10 -mx-4 mb-6 flex gap-2 overflow-x-auto bg-bg px-4 py-2 md:top-20 md:mx-0 md:mb-0 md:flex-col md:self-start md:overflow-visible md:p-0">
        {[
          ["#account-heading", "계정"],
          ["#theme-heading", "화면 · 보기"],
          ["#alerts-heading", "알림"],
          ["#credit-heading", "공개 범위 · 메시지"],
          ["#data-heading", "내 데이터 · 탈퇴"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-line px-3.5 text-sm hover:border-quiet md:rounded-xl md:border-0 md:px-3 md:hover:bg-surface"
          >
            {label}
          </a>
        ))}
      </nav>
    {/* 묶음이 13개라 여백만으로는 어디서 끊기는지 알기 어렵다. 묶음마다 가는 선으로 나눈다 */}
    <div className="flex min-w-0 flex-col gap-8 [&>section]:border-t [&>section]:border-line [&>section]:pt-8">
      <header className="flex items-center gap-3">
        <Link href="/me" className="text-sm text-quiet hover:text-text">
          ‹ 마이
        </Link>
        <h1 className="text-2xl font-bold">설정</h1>
      </header>

      <section aria-labelledby="account-heading" className="flex flex-col gap-3">
        <h2 id="account-heading" className="scroll-mt-28 text-lg font-semibold">
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
          <h2 id="warnings-heading" className="scroll-mt-28 text-lg font-semibold">
            받은 경고
          </h2>
          <ul className="flex flex-col gap-2">
            {warnings.map((w) => (
              <li key={w.id} className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm">
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
        <h2 id="theme-heading" className="scroll-mt-28 text-lg font-semibold">
          화면
        </h2>
        <ThemeForm current={themeChoice} />
      </section>

      <section aria-labelledby="interests-heading" className="flex flex-col gap-3">
        <h2 id="interests-heading" className="scroll-mt-28 text-lg font-semibold">
          관심 분야
        </h2>
        <p className="text-sm text-quiet">고른 분야의 사진이 홈 &lsquo;추천&rsquo;에서 조금 더 위에 나와요.</p>
        <InterestPicker initial={profile?.interest_categories ?? []} />
      </section>

      <section id="viewing" aria-labelledby="viewing-heading" className="flex scroll-mt-20 flex-col gap-3">
        <h2 id="viewing-heading" className="scroll-mt-28 text-lg font-semibold">
          사진 보기
        </h2>
        <SettingToggle
          kind="showVeiled"
          initial={profile?.show_veiled ?? false}
          title="가림 표시 사진 바로 보기"
          help="피 · 공포 분장처럼 업로더나 운영자가 가림 표시를 붙인 사진을 흐리게 가리지 않고 바로 보여 드려요."
        />
      </section>

      <section aria-labelledby="alerts-heading" className="flex flex-col gap-3">
        <h2 id="alerts-heading" className="scroll-mt-28 text-lg font-semibold">
          알림
        </h2>
        <SettingToggle
          kind="memory"
          initial={profile?.memory_alerts ?? true}
          title="추억 알림"
          help="예전 오늘 찍은 내 사진 · 크레딧된 사진이 있으면 하루 한 번, 12월에는 '나의 한 해'가 열리면 알려 드려요."
        />
      </section>

      <section aria-labelledby="credit-heading" className="flex flex-col gap-3">
        <h2 id="credit-heading" className="scroll-mt-28 text-lg font-semibold">
          크레딧
        </h2>
        <SettingToggle
          kind="creditAuto"
          initial={profile?.credit_auto_approve ?? false}
          title="팔로우하는 회원의 태그는 자동 승인"
          help="내가 팔로우하는 회원이 나를 크레딧으로 태그하면 바로 승인해요. 모르는 계정의 태그는 늘 직접 승인하고, 승인한 뒤에도 언제든 뺄 수 있어요."
        />
      </section>

      <section id="push" aria-labelledby="push-heading" className="flex scroll-mt-20 flex-col gap-3">
        <h2 id="push-heading" className="scroll-mt-28 text-lg font-semibold">
          휴대폰 · 브라우저 알림
        </h2>
        <PushSettings publicKey={process.env.VAPID_PUBLIC_KEY || null} />
      </section>

      <section id="messages" aria-labelledby="messages-heading" className="flex scroll-mt-20 flex-col gap-3">
        <h2 id="messages-heading" className="scroll-mt-28 text-lg font-semibold">
          메시지 · 차단
        </h2>
        <MessageSettings receive={setting?.receive ?? "everyone"} blocked={blocked} />
      </section>

      <section aria-labelledby="data-heading" className="flex flex-col gap-3">
        <h2 id="data-heading" className="scroll-mt-28 text-lg font-semibold">
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
        <h2 id="delete-heading" className="scroll-mt-28 text-lg font-semibold">
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
    </div>
  );
}
