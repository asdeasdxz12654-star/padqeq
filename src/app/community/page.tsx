import type { Metadata } from "next";

export const metadata: Metadata = { title: "커뮤니티" };

// 커뮤니티 탭: 행사 캘린더(S-17) · 행사 페이지(S-12) · 섭외 게시판(S-13)이 들어올 자리.
// 1단계(운영자 단독 업로드)에서는 안내만 둔다.
const COMING = [
  { title: "행사 캘린더", body: "다가오는 행사와 지난 행사의 사진을 달력으로 모아 봐요." },
  { title: "행사 페이지", body: "같은 행사에서 찍힌 사진과 참가자 코스 목록을 한곳에서 봐요." },
  { title: "구인 · 섭외 게시판", body: "모델 · 촬영 · 합동 코스를 구해요. 플랫폼 안에서 돈을 주고받지는 않아요." },
];

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 pb-16 md:px-6">
      <h1 className="text-2xl font-bold">커뮤니티</h1>
      <p className="mt-2 text-sm leading-relaxed text-quiet">
        지금은 운영자가 사진을 담아 두는 단계예요. 회원 업로드가 열리면 아래 기능을 차례로 열 예정이에요.
      </p>
      <ul className="mt-8 flex flex-col gap-3">
        {COMING.map((item) => (
          <li key={item.title} className="rounded-2xl border border-line p-4">
            <p className="flex items-center gap-2 font-semibold">
              {item.title}
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-normal text-quiet">준비 중</span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-quiet">{item.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
