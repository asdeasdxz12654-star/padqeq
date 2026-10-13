import { createClient } from "@/lib/supabase/server";
import { AppealForm } from "./appeal-form";

const APPEAL_LIMIT = 3;
const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

/** 작성자에게만: 임시 비공개 · 운영자 게시 중단 안내와 소명 (이의 제기) */
export async function ModerationNotice({ postId, removed }: { postId: string; removed: boolean }) {
  const supabase = await createClient();
  const { data: appeals } = await supabase
    .from("appeals")
    .select("id, status, statement, created_at, resolved_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  const list = appeals ?? [];
  const open = list.find((a) => a.status === "open");
  const lastRejected = list[0]?.status === "rejected" ? list[0] : null;
  const remaining = APPEAL_LIMIT - list.length;

  return (
    <section
      aria-labelledby="moderation-heading"
      className="mx-4 mb-4 flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm md:mx-0"
    >
      <h2 id="moderation-heading" className="font-semibold text-amber-200">
        {removed ? "운영 정책에 따라 게시가 중단된 글이에요" : "신고로 임시 비공개 중이에요"}
      </h2>
      <p className="leading-relaxed text-amber-100/90">
        {removed
          ? "다른 사람에게는 보이지 않고, 직접 다시 게시할 수 없어요. 문제가 없다고 생각하시면 소명해 주세요."
          : "운영자가 확인할 때까지 다른 사람에게는 보이지 않아요. 촬영 동의를 받았거나 권리에 문제가 없다면 소명해 주세요."}
      </p>

      {open ? (
        <p className="rounded-lg bg-bg/40 px-3 py-2 text-amber-100/90">
          {timeFormat.format(new Date(open.created_at))}에 보낸 소명을 검토하고 있어요. 결과는 알림으로 알려 드릴게요.
        </p>
      ) : (
        <>
          {lastRejected && (
            <p className="rounded-lg bg-bg/40 px-3 py-2 text-amber-100/90">
              {lastRejected.resolved_at ? `${timeFormat.format(new Date(lastRejected.resolved_at))}에 ` : ""}
              검토한 결과 조치를 유지하기로 했어요.
            </p>
          )}
          {remaining > 0 ? (
            <AppealForm postId={postId} remaining={remaining} />
          ) : (
            <p className="text-amber-100/90">이 게시물은 소명을 {APPEAL_LIMIT}번 모두 사용했어요.</p>
          )}
        </>
      )}
    </section>
  );
}
