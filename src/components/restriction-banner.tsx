import { getViewer } from "@/lib/auth/viewer";
import { OPERATOR } from "@/lib/policy";
import { KST } from "@/lib/format/kst";

const dateFormat = KST.dateTimeLong;

/** 이용 정지 안내 (본인에게만, 모든 화면 위에). 다른 사람에게는 정지 여부가 드러나지 않는다. */
export async function RestrictionBanner() {
  const viewer = await getViewer();
  if (!viewer?.restriction) return null;
  const { until, reason } = viewer.restriction;
  return (
    <div role="status" className="border-b border-danger-line bg-danger-soft">
      <div className="mx-auto max-w-6xl px-4 py-3 text-sm leading-relaxed text-danger md:px-6">
        <p>
          <span className="font-semibold">{dateFormat.format(new Date(until))}까지 이용이 제한돼요.</span> 사유: {reason}
        </p>
        <p className="mt-1 text-xs text-danger">
          기간 동안 사진 올리기 · 글 수정 · 신고 · 컬렉션 만들기를 할 수 없어요. 보기 · 저장 · 소명 · 탈퇴는 할 수 있어요. 이의가
          있으면{" "}
          <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-2">
            {OPERATOR.email}
          </a>
          로 알려 주세요.
        </p>
      </div>
    </div>
  );
}
