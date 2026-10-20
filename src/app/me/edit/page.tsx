import { redirect } from "next/navigation";

// 프로필 고치기는 설정 › 프로필 수정(첫 탭)으로 옮겼다. 예전 주소로 와도 그곳으로.
export default function ProfileEditPage() {
  redirect("/settings");
}
