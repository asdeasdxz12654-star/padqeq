import type { Metadata } from "next";
import { isStaffRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { AdminAlertForm } from "../admin-alert-form";
import { mySettings, settingsViewer } from "../load";
import { PushSettings } from "../push-settings";
import { SettingToggle } from "../setting-toggle";

export const metadata: Metadata = { title: "알림 · 설정", robots: { index: false } };

// 설정 › 알림: 추억 알림 · 휴대폰 · 브라우저 알림(웹 푸시) · (운영진만) 운영 알림
export default async function SettingsAlertsPage() {
  const viewer = await settingsViewer("/settings/alerts");
  // 2단계 인증 전이면 역할이 회원으로 보이므로 그 경우도 운영진으로 본다
  const staff = isStaffRole(viewer.profile.role) || viewer.mfaRequired;
  const [settings, adminAlerts] = await Promise.all([
    mySettings(),
    staff ? createClient().then((s) => s.from("admin_alert_settings").select("mode").eq("user_id", viewer.id).maybeSingle()) : null,
  ]);
  const adminMode = adminAlerts?.data?.mode;

  return (
    <>
      <section aria-labelledby="alerts-heading" className="flex flex-col gap-3">
        <h1 id="alerts-heading" className="text-lg font-semibold">
          알림
        </h1>
        <SettingToggle
          kind="memory"
          initial={settings?.memory_alerts ?? true}
          title="추억 알림"
          help="예전 오늘 찍은 내 사진 · 크레딧된 사진이 있으면 하루 한 번, 12월에는 '나의 한 해'가 열리면 알려 드려요."
        />
      </section>

      <section id="push" aria-labelledby="push-heading" className="flex scroll-mt-28 flex-col gap-3 border-t border-line pt-8">
        <h2 id="push-heading" className="text-lg font-semibold">
          휴대폰 · 브라우저 알림
        </h2>
        <PushSettings publicKey={process.env.VAPID_PUBLIC_KEY || null} />
      </section>

      {staff && (
        <section id="admin-alerts" aria-labelledby="admin-alerts-heading" className="flex scroll-mt-28 flex-col gap-3 border-t border-line pt-8">
          <h2 id="admin-alerts-heading" className="text-lg font-semibold">
            운영 알림 <span className="text-xs font-normal text-quiet">운영진에게만 보여요</span>
          </h2>
          <AdminAlertForm initial={adminMode === "urgent" || adminMode === "off" ? adminMode : "all"} />
          <p className="text-xs leading-relaxed text-quiet">이 기기에서 위의 휴대폰 알림을 켠 경우에만 와요 (아이폰은 홈 화면 앱에서). 같은 글의 긴급 알림은 1시간에 한 번만 와요.</p>
        </section>
      )}
    </>
  );
}
