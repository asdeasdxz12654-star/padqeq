import type { Metadata } from "next";
import { settingsViewer } from "./load";
import { ProfileSections } from "./profile-sections";

export const metadata: Metadata = { title: "프로필 수정 · 설정", robots: { index: false } };

// 설정 첫 탭: 프로필 수정 (예전 마이 › 프로필 고치기 · 크리에이터 정보)
export default async function SettingsProfilePage() {
  const viewer = await settingsViewer("/settings");
  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-4">
      <h1 id="profile-heading" className="text-lg font-semibold">
        프로필 수정
      </h1>
      <ProfileSections userId={viewer.id} handle={viewer.profile.handle} displayName={viewer.profile.display_name} />
    </section>
  );
}
