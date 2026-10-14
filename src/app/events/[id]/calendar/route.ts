import type { NextRequest } from "next/server";
import { eventIcs } from "@/lib/events/calendar";
import { getEvent } from "@/lib/events/load";

// 캘린더 앱에 추가 (S-12 ②): 공식 행사 하나짜리 .ics
export async function GET(request: NextRequest, ctx: RouteContext<"/events/[id]/calendar">) {
  const event = await getEvent((await ctx.params).id);
  if (!event || event.status !== "official") return new Response("찾을 수 없어요", { status: 404 });

  const pageUrl = new URL(`/events/${event.id}`, request.nextUrl.origin).toString();
  return new Response(eventIcs(event, pageUrl, new Date()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="haedam-event.ics"; filename*=UTF-8''${encodeURIComponent(`${event.name}.ics`)}`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
