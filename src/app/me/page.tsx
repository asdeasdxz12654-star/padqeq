import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "마이",
  robots: { index: false },
};

// S-09 프로필은 업로드 기능과 함께 채운다. 지금은 계정 확인 · 로그아웃만.
export default async function MePage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me"));
  const { profile } = viewer;

  return (
    <div className="mx-auto max-w-xl px-4 pt-10 pb-16 md:px-6">
      <div className="flex items-center gap-4">
        <div aria-hidden="true" className="size-16 shrink-0 rounded-full bg-slot" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{profile.display_name}</h1>
          <p className="text-sm text-quiet">
            @{profile.handle}
            {profile.role === "admin" && (
              <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-text">운영자</span>
            )}
          </p>
        </div>
      </div>

      <form action={signOut} className="mt-10">
        <button type="submit" className="min-h-12 w-full rounded-xl border border-line px-4 text-sm font-semibold">
          로그아웃
        </button>
      </form>
    </div>
  );
}
