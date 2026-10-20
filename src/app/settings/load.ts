import "server-only";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** 설정 탭 공통: 로그인 확인 (로그인 뒤 이 탭으로 돌아온다) */
export async function settingsViewer(path: string) {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", path));
  if (!viewer.profile) redirect(withNext("/welcome", path));
  return { ...viewer, profile: viewer.profile };
}

/** 개인 설정 열 (본인 전용 함수) */
export async function mySettings() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_settings");
  return data?.[0] ?? null;
}
