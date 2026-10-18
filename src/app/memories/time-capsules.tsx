import { Nanum_Pen_Script } from "next/font/google";
import Link from "next/link";
import { todayKst } from "@/lib/auth/signup-input";
import { daysUntil } from "@/lib/capsules/open-on";
import { createClient } from "@/lib/supabase/server";
import { DiscardCapsule } from "./discard-capsule";

// 편지 손글씨 (이 화면에서만 받는다)
const pen = Nanum_Pen_Script({ weight: "400", preload: false, display: "swap" });
const dot = (d: string) => d.replaceAll("-", ". ");
const kstDate = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);

/** 내 타임캡슐: 열린 편지는 종이에 손글씨로, 아직이면 여는 날과 남은 날만 */
export async function TimeCapsules() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_time_capsules");
  if (error) throw error;
  if (data.length === 0)
    return (
      <p className="text-sm text-quiet">
        아직 묻은 타임캡슐이 없어요. 내 사진 화면의 <span className="font-semibold text-text">더 보기 › 타임캡슐 묻기</span>에서 1~10년 뒤의 나에게 편지를 남길 수 있어요.
      </p>
    );

  const postIds = [...new Set(data.flatMap((c) => (c.post_id ? [c.post_id] : [])))];
  const { data: posts } = postIds.length ? await supabase.from("posts").select("id, title").in("id", postIds) : { data: [] };
  const titleOf = new Map((posts ?? []).map((p) => [p.id, p.title]));
  const today = todayKst();
  const opened = data.filter((c) => c.letter !== null);
  const sealed = data.filter((c) => c.letter === null).toSorted((a, b) => a.open_on.localeCompare(b.open_on));

  const postLink = (id: string | null) =>
    id && titleOf.has(id) ? (
      <Link href={`/p/${id}`} className="underline underline-offset-2 hover:text-text">
        {titleOf.get(id)}
      </Link>
    ) : (
      <span>지금은 볼 수 없는 사진</span>
    );

  return (
    <div className="flex flex-col gap-6">
      {opened.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {opened.map((c) => (
            <li key={c.id} className={`${pen.className} flex rotate-[-0.6deg] flex-col gap-2 bg-[#f6f3ec] p-6 text-[#2a2a2a] shadow-lg even:rotate-[0.6deg]`}>
              <p className="text-2xl leading-none text-[#c54a40]">{dot(kstDate(c.created_at))}의 나에게서</p>
              <p className="text-2xl leading-snug whitespace-pre-line">{c.letter}</p>
              <p className="mt-1 font-sans text-xs text-[#6b6b66]">
                {dot(c.open_on)}에 열림 · {postLink(c.post_id)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {sealed.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {sealed.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-sun" />
              <span className="font-semibold tabular-nums">D-{daysUntil(today, c.open_on)}</span>
              <span className="text-quiet tabular-nums">{dot(c.open_on)}에 열려요</span>
              <span className="min-w-0 flex-1 truncate text-quiet">{postLink(c.post_id)}</span>
              <DiscardCapsule id={c.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
