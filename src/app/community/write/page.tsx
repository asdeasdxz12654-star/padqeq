import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { BOARD_LABEL, isOpenBoard, WRITE_TITLE } from "@/lib/boards/labels";
import { REGIONS, type Region } from "@/lib/events/calendar";
import { createClient } from "@/lib/supabase/server";
import { type BoardDraft, BoardPostForm } from "./board-post-form";

export const metadata: Metadata = { title: "글쓰기", robots: { index: false } };

export default async function WritePage({ searchParams }: PageProps<"/community/write">) {
  const params = await searchParams;
  const editId = typeof params.edit === "string" && z.uuid().safeParse(params.edit).success ? params.edit : null;
  const board = isOpenBoard(params.board) ? params.board : "free";
  const back = editId ? `/community/write?edit=${editId}` : `/community/write?board=${board}`;

  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", back));
  if (!viewer.profile) redirect(withNext("/welcome", back));

  const supabase = await createClient();

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

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 pb-16 md:px-6">
      <Link href={editId ? `/community/${editId}` : `/community${board === "free" ? "" : `?board=${board}`}`} className="text-sm text-quiet hover:underline">
        ‹ 돌아가기
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{editId ? "글 고치기" : WRITE_TITLE[board]}</h1>
      {!editId && <p className="mt-2 text-sm text-quiet">{BOARD_LABEL[board].help}</p>}
      {viewer.restriction && <p className="mt-3 text-sm text-danger">이용이 제한된 기간이라 글을 쓸 수 없어요.</p>}
      <div className="mt-6">
        <BoardPostForm id={editId} initial={initial} />
      </div>
    </div>
  );
}
