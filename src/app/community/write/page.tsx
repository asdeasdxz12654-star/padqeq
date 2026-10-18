import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { isBoard } from "@/lib/boards/labels";
import { REGIONS, type Region } from "@/lib/events/calendar";
import { createClient } from "@/lib/supabase/server";
import { AdultConfirm } from "../adult-confirm";
import { type BoardDraft, BoardPostForm } from "./board-post-form";

export const metadata: Metadata = { title: "글쓰기", robots: { index: false } };

export default async function WritePage({ searchParams }: PageProps<"/community/write">) {
  const params = await searchParams;
  const editId = typeof params.edit === "string" && z.uuid().safeParse(params.edit).success ? params.edit : null;
  const board = isBoard(params.board) ? params.board : "free";
  const back = editId ? `/community/write?edit=${editId}` : `/community/write?board=${board}`;

  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", back));
  if (!viewer.profile) redirect(withNext("/welcome", back));

  const supabase = await createClient();
  const { data: adult } = await supabase.rpc("am_i_adult");

  let initial: BoardDraft = { board, title: "", body: "", region: null, castingKind: null, castingTerms: null, shootOn: null };
  if (editId) {
    const { data } = await supabase
      .from("board_posts")
      .select("board, title, body, region, casting_kind, casting_terms, shoot_on, author_id")
      .eq("id", editId)
      .maybeSingle();
    if (!data || data.author_id !== viewer.id) notFound();
    initial = {
      board: data.board,
      title: data.title,
      body: data.body,
      region: (REGIONS as readonly string[]).includes(data.region ?? "") ? (data.region as Region) : null,
      castingKind: data.casting_kind,
      castingTerms: data.casting_terms,
      shootOn: data.shoot_on,
    };
  }
  const needsAdult = initial.board === "casting" && !adult;
  if (needsAdult && !editId) initial = { ...initial, board: "free" };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 pb-16 md:px-6">
      <Link href={editId ? `/community/${editId}` : `/community${board === "free" ? "" : `?board=${board}`}`} className="text-sm text-quiet hover:underline">
        ‹ 돌아가기
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{editId ? "글 고치기" : "글쓰기"}</h1>
      {viewer.restriction && <p className="mt-3 text-sm text-danger">이용이 제한된 기간이라 글을 쓸 수 없어요.</p>}
      {board === "casting" && !adult && !editId && (
        <div className="mt-6">
          <AdultConfirm reason="구인 · 섭외 게시판은 만 19세 이상만 쓸 수 있어요." />
        </div>
      )}
      <div className="mt-6">
        <BoardPostForm id={editId} initial={initial} castingAllowed={Boolean(adult)} />
      </div>
      <p className="mt-6 text-xs leading-relaxed text-quiet">
        섭외 글은 가입 7일이 지나야 쓸 수 있어요. 해담은 결제 · 정산 · 수수료를 다루지 않고, 조건은 당사자끼리 메시지로 합의해요.
      </p>
    </div>
  );
}
