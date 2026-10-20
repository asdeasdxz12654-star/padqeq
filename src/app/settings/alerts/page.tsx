import type { Metadata } from "next";
import { mySettings, settingsViewer } from "../load";
import { PushSettings } from "../push-settings";
import { SettingToggle } from "../setting-toggle";

export const metadata: Metadata = { title: "알림 · 설정", robots: { index: false } };

// 설정 › 알림: 추억 알림 · 휴대폰 · 브라우저 알림(웹 푸시)
export default async function SettingsAlertsPage() {
  await settingsViewer("/settings/alerts");
  const settings = await mySettings();

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
    </>
  );
}
