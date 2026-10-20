import type { Metadata } from "next";
import { cookies } from "next/headers";
import { InterestPicker } from "../interest-picker";
import { mySettings, settingsViewer } from "../load";
import { SettingToggle } from "../setting-toggle";
import { type ThemeChoice, ThemeForm } from "../theme-form";

export const metadata: Metadata = { title: "화면 · 보기 · 설정", robots: { index: false } };

// 설정 › 화면 · 보기: 테마 · 관심 분야 · 가림 사진 보기
export default async function SettingsDisplayPage() {
  await settingsViewer("/settings/display");
  const [settings, jar] = await Promise.all([mySettings(), cookies()]);
  const savedTheme = jar.get("theme")?.value;
  const themeChoice: ThemeChoice = savedTheme === "dark" || savedTheme === "system" ? savedTheme : "light";

  return (
    <>
      <section aria-labelledby="theme-heading" className="flex flex-col gap-3">
        <h1 id="theme-heading" className="text-lg font-semibold">
          화면
        </h1>
        <ThemeForm current={themeChoice} />
      </section>

      <section aria-labelledby="interests-heading" className="flex flex-col gap-3 border-t border-line pt-8">
        <h2 id="interests-heading" className="text-lg font-semibold">
          관심 분야
        </h2>
        <p className="text-sm text-quiet">고른 분야의 사진이 홈 &lsquo;추천&rsquo;에서 조금 더 위에 나와요.</p>
        <InterestPicker initial={settings?.interest_categories ?? []} />
      </section>

      <section id="viewing" aria-labelledby="viewing-heading" className="flex scroll-mt-28 flex-col gap-3 border-t border-line pt-8">
        <h2 id="viewing-heading" className="text-lg font-semibold">
          사진 보기
        </h2>
        <SettingToggle
          kind="showVeiled"
          initial={settings?.show_veiled ?? false}
          title="가림 표시 사진 바로 보기"
          help="피 · 공포 분장처럼 업로더나 운영자가 가림 표시를 붙인 사진을 흐리게 가리지 않고 바로 보여 드려요."
        />
      </section>
    </>
  );
}
