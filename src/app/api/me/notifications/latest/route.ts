import { getViewer } from "@/lib/auth/viewer";
import { describeNotification } from "@/lib/notifications/describe";
import { createClient } from "@/lib/supabase/server";

// 웹 푸시를 받은 서비스 워커가 보여 줄 문구 (public/sw.js). 본인의 가장 최근 안 읽은 알림 하나.
// 같은 출처의 요청만 받는다 (서비스 워커 · 화면). 저장하지 않는다.
export async function GET(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return new Response(null, { status: 403 });
  const headers = { "Cache-Control": "private, no-store" };

  const viewer = await getViewer();
  if (!viewer?.profile) return Response.json({ error: "login" }, { status: 401, headers });

  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id, kind, actor:profiles!notifications_actor_id_fkey(handle), post:posts!notifications_post_id_fkey(id, title), event:events!notifications_event_id_fkey(id, name), board:board_posts!notifications_board_post_id_fkey(id, title), thread_id",
      )
      .eq("recipient_id", viewer.id)
      .is("read_at", null)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", viewer.id).is("read_at", null),
  ]);
  if (!data) return Response.json({ title: "해담", body: "새 알림이 있어요.", url: "/notifications", tag: "haedam" }, { headers });

  const { text, href } = describeNotification({
    kind: data.kind,
    actorHandle: data.actor?.handle ?? null,
    post: data.post,
    event: data.event,
    board: data.board,
    threadId: data.thread_id,
  });
  const more = (count ?? 1) > 1 ? ` (외 ${(count ?? 1) - 1}개)` : "";
  return Response.json(
    { title: data.post?.title ? `해담 · ${data.post.title}` : "해담", body: `${text}${more}`, url: href ?? "/notifications", tag: "haedam" },
    { headers },
  );
}
