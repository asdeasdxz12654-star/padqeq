import Link from "next/link";
import { switchBannerText } from "@/lib/support/labels";
import { getSiteSwitches, getUpcomingMaintenance } from "@/lib/support/switches";

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 모든 화면 위 안내 (S-20 ⑦ · ⑧): 긴급 스위치 · 24시간 안의 점검 공지 */
export async function SiteNotice() {
  const [switches, maintenance] = await Promise.all([getSiteSwitches(), getUpcomingMaintenance()]);
  const text = switchBannerText(switches);
  if (!text && !maintenance) return null;

  return (
    <div role="status" className="border-b border-warn-line bg-warn-soft">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2.5 text-sm leading-relaxed text-warn md:px-6">
        {text && <p>{text}</p>}
        {maintenance?.maintenance_at && (
          <p>
            {timeFormat.format(new Date(maintenance.maintenance_at))}부터 점검이 있어요.{" "}
            <Link href={`/help/notices/${maintenance.id}`} className="underline underline-offset-2">
              {maintenance.title}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
