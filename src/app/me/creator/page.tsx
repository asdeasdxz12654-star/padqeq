import { redirect } from "next/navigation";

// 크리에이터 정보는 설정 › 프로필 수정 안으로 옮겼다. 예전 주소로 와도 그곳으로.
export default function CreatorSettingsPage() {
  redirect("/settings");
}
