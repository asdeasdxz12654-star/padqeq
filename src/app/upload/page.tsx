import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { currentYearKst } from "@/lib/year-chips";
import { UploadStudio } from "./upload-studio";

export const metadata: Metadata = {
  title: "업로드",
  robots: { index: false },
};

// A-02 / S-08 업로드 (1차: 한 번에 게시물 하나, JPEG · PNG · WebP · AVIF)
export default async function UploadPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", "/upload"));
  if (!viewer.profile) redirect(withNext("/welcome", "/upload"));

  if (viewer.restriction) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-xl font-bold">지금은 사진을 올릴 수 없어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-quiet">이용이 제한된 기간이에요. 기간과 사유는 화면 위 안내를 봐 주세요.</p>
      </div>
    );
  }

  if (!viewer.profile.can_upload) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-xl font-bold">업로드는 아직 열리지 않았어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-quiet">
          지금은 운영자만 사진을 올릴 수 있어요. 회원 업로드는 초대 방식으로 차례대로 열 예정이에요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 md:px-6">
      <h1 className="text-2xl font-bold">업로드</h1>
      <p className="mt-2 text-sm leading-relaxed text-quiet">
        사진은 이 브라우저에서 고화질로 변환한 뒤 올라가요. 원본 파일은 서버에 저장하지 않으니 따로 보관해 주세요.
      </p>
      <UploadStudio isAdmin={viewer.profile.role === "admin"} viewerHandle={viewer.profile.handle} currentYear={currentYearKst()} />
    </div>
  );
}
