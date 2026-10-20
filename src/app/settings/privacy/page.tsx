import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { mySettings, settingsViewer } from "../load";
import { MessageSettings } from "../message-settings";
import { SettingToggle } from "../setting-toggle";

export const metadata: Metadata = { title: "공개 범위 · 메시지 · 설정", robots: { index: false } };

// 설정 › 공개 범위 · 메시지: 크레딧 자동 승인 · 메시지 받기 범위 · 차단 목록
export default async function SettingsPrivacyPage() {
  const viewer = await settingsViewer("/settings/privacy");
  const supabase = await createClient();
  const [settings, { data: setting }, { data: blocks }] = await Promise.all([
    mySettings(),
    supabase.from("message_settings").select("receive").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("blocks").select("blocked:profiles!blocks_blocked_id_fkey(id, handle)").eq("blocker_id", viewer.id).limit(1000),
  ]);
  const blocked = (blocks ?? []).flatMap((b) => (b.blocked ? [b.blocked] : []));

  return (
    <>
      <section aria-labelledby="credit-heading" className="flex flex-col gap-3">
        <h1 id="credit-heading" className="text-lg font-semibold">
          크레딧
        </h1>
        <SettingToggle
          kind="creditAuto"
          initial={settings?.credit_auto_approve ?? false}
          title="팔로우하는 회원의 태그는 자동 승인"
          help="내가 팔로우하는 회원이 나를 크레딧으로 태그하면 바로 승인해요. 모르는 계정의 태그는 늘 직접 승인하고, 승인한 뒤에도 언제든 뺄 수 있어요."
        />
      </section>

      <section id="messages" aria-labelledby="messages-heading" className="flex scroll-mt-28 flex-col gap-3 border-t border-line pt-8">
        <h2 id="messages-heading" className="text-lg font-semibold">
          메시지 · 차단
        </h2>
        <MessageSettings receive={setting?.receive ?? "everyone"} blocked={blocked} />
      </section>
    </>
  );
}
