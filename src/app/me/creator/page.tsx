import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { currentYearKst } from "@/lib/year-chips";
import { AdultConfirm } from "@/app/community/adult-confirm";
import { type CreatorDraft, CreatorForm } from "./creator-form";

export const metadata: Metadata = { title: "크리에이터 정보", robots: { index: false } };

export default async function CreatorSettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/me/creator"));
  if (!viewer.profile) redirect(withNext("/welcome", "/me/creator"));

  const supabase = await createClient();
  const [{ data: row }, { data: adult }] = await Promise.all([
    supabase.from("creator_profiles").select("listed, roles, region, active_since, works, casting_open").eq("user_id", viewer.id).maybeSingle(),
    supabase.rpc("am_i_adult"),
  ]);
  const allowed = ["cosplayer", "photographer", "model", "retoucher"] as const;
  const initial: CreatorDraft = {
    listed: row?.listed ?? true,
    roles: (row?.roles ?? []).filter((r): r is (typeof allowed)[number] => (allowed as readonly string[]).includes(r)),
    region: row?.region ?? "",
    activeSince: row?.active_since ? String(row.active_since) : "",
    works: row?.works ?? "",
    castingOpen: row?.casting_open ?? false,
  };

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 pb-16 md:px-6">
      <Link href="/me" className="text-sm text-quiet hover:underline">
        ‹ 마이
      </Link>
      <h1 className="mt-4 text-2xl font-bold">크리에이터 정보</h1>
      <p className="mt-2 text-sm leading-relaxed text-quiet">
        <Link href="/creators" className="underline underline-offset-2">
          크리에이터 디렉토리
        </Link>
        에 나를 소개해요. 직접 켠 경우에만 보이고, 언제든 끄거나 지울 수 있어요.
      </p>
      <div className="mt-6">
        <CreatorForm initial={initial} exists={row !== null} adult={Boolean(adult)} currentYear={currentYearKst()} />
      </div>
      {!adult && (
        <div className="mt-8">
          <AdultConfirm reason="섭외 가능 표시 · 섭외 게시판은 만 19세 이상만 쓸 수 있어요." />
        </div>
      )}
    </div>
  );
}
