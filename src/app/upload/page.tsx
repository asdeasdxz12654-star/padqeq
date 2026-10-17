import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { InAppBrowserNotice } from "@/components/in-app-browser-notice";
import { discardStaleUploadSlots } from "@/lib/photos/upload-slots";
import { createClient } from "@/lib/supabase/server";
import { getSiteSwitches } from "@/lib/support/switches";
import { currentYearKst } from "@/lib/year-chips";
import { z } from "zod";
import type { TagOption } from "./tag-actions";
import { InviteForm } from "./invite-form";
import { UploadStudio } from "./upload-studio";

export const metadata: Metadata = {
  title: "업로드",
  robots: { index: false },
};

// A-02 / S-08 업로드: 여러 장을 촬영 시각으로 묶어 게시물 여러 개로 (한 번에 500장, JPEG · HEIC · PNG · WebP · AVIF · RAW)
export default async function UploadPage({ searchParams }: PageProps<"/upload">) {
  // ?event=행사 id: 행사 끝난 뒤 알림 · 행사 화면에서 오면 행사 · 장소 태그를 붙인 채로 연다
  const eventParam = (await searchParams).event;
  const eventId = typeof eventParam === "string" && z.uuid().safeParse(eventParam).success ? eventParam : null;
  const here = eventId ? `/upload?event=${eventId}` : "/upload";
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", here));
  if (!viewer.profile) redirect(withNext("/welcome", here));

  if (viewer.restriction) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-xl font-bold">지금은 사진을 올릴 수 없어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-quiet">이용이 제한된 기간이에요. 기간과 사유는 화면 위 안내를 봐 주세요.</p>
      </div>
    );
  }

  const switches = await getSiteSwitches();
  if (viewer.profile.role !== "admin" && (switches.uploadsClosed || switches.readOnly)) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-xl font-bold">사진 올리기를 잠시 멈췄어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-quiet">운영 점검 중이에요. 곧 다시 열릴 예정이니 조금 뒤에 와 주세요.</p>
      </div>
    );
  }

  if (!viewer.profile.can_upload) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        {switches.uploadStage === "invite" ? (
          <>
            <h1 className="text-xl font-bold">초대 코드로 업로드를 열어요</h1>
            <p className="mt-2 text-sm leading-relaxed text-quiet">지금은 초대받은 회원만 사진을 올릴 수 있어요. 받은 초대 코드 8자리를 넣어 주세요.</p>
            <InviteForm />
          </>
        ) : switches.uploadStage === "open" ? (
          <>
            <h1 className="text-xl font-bold">사진을 올릴 수 없는 계정이에요</h1>
            <p className="mt-2 text-sm leading-relaxed text-quiet">운영 정책에 따라 업로드 권한이 회수됐어요. 이의가 있으면 1:1 문의로 알려 주세요.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">업로드는 아직 열리지 않았어요</h1>
            <p className="mt-2 text-sm leading-relaxed text-quiet">
              지금은 운영자만 사진을 올릴 수 있어요. 회원 업로드는 초대 방식으로 차례대로 열 예정이에요.
            </p>
          </>
        )}
      </div>
    );
  }

  // 이번 달 올린 사진 수 (운영자는 제한 없음, A-05 ③)
  const isAdmin = viewer.profile.role === "admin";
  await discardStaleUploadSlots();
  const supabase = await createClient();
  const [quota, fromEvent] = await Promise.all([
    isAdmin ? Promise.resolve(null) : supabase.rpc("my_upload_quota").maybeSingle().then((r) => r.data),
    eventId ? eventTags(eventId) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 md:px-6">
      <InAppBrowserNotice purpose="upload" />
      <h1 className="text-2xl font-bold">업로드</h1>
      <p className="mt-2 text-sm leading-relaxed text-quiet">
        사진은 이 브라우저에서 고화질로 변환한 뒤 올라가요. 원본 파일은 서버에 저장하지 않으니 따로 보관해 주세요.
      </p>
      {quota && (
        <p className={`mt-1 text-sm ${quota.used >= quota.quota ? "text-red-300" : "text-quiet"}`}>
          이번 달 {quota.used.toLocaleString("ko-KR")} / {quota.quota.toLocaleString("ko-KR")}장 올렸어요. 매달 1일에 다시 세요.
        </p>
      )}
      {fromEvent && fromEvent.tags.length > 0 && (
        <p role="status" className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <strong>{fromEvent.name}</strong>에서 찍은 사진을 올려요. 행사 태그{fromEvent.tags.length > 1 ? "와 장소 태그" : ""}가 미리 붙어 있어요. 묶음마다 빼거나 바꿀 수 있어요.
        </p>
      )}
      <UploadStudio isAdmin={isAdmin} viewerHandle={viewer.profile.handle} currentYear={currentYearKst()} initialTags={fromEvent?.tags ?? []} />
    </div>
  );
}

/** 공식 행사의 행사 태그 · 장소 태그 (공식 태그만) */
async function eventTags(eventId: string): Promise<{ name: string; tags: TagOption[] } | null> {
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("name, tag_id, place_tag_id").eq("id", eventId).eq("status", "official").maybeSingle();
  if (!event) return null;
  const ids = [event.tag_id, event.place_tag_id].filter((id): id is string => id !== null);
  if (ids.length === 0) return { name: event.name, tags: [] };
  const { data: tags } = await supabase.from("tags").select("id, kind, name, slug").in("id", ids).eq("status", "official");
  // 행사 태그가 먼저
  const sorted = ids.flatMap((id) => (tags ?? []).filter((t) => t.id === id));
  return { name: event.name, tags: sorted.map((t) => ({ id: t.id, kind: t.kind, name: t.name, slug: t.slug, parentName: null, pending: false })) };
}
