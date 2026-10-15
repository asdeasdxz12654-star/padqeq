import { isUuid } from "@/lib/ids";
import "server-only";
import type { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { photoStore } from "@/lib/photos/store";
import { createClient } from "@/lib/supabase/server";
import { evidenceObjectKey, sniffEvidence } from "./evidence";

// 신고 증거 · 소명 증빙 파일 (S-15 ⑦ · S-19 ⑦) 공용 처리
//  PUT: 올린 사람이 파일을 올린다. 자리(add_*_evidence)에 적은 형식 · 용량과 실제 파일이 맞아야 한다.
//  GET: 운영자만 연다. 저장 · 캐시하지 않는다.

export type EvidenceKind = "report" | "appeal";

const NO_STORE = { "Cache-Control": "private, no-store" };
const fail = (status: number, message: string) => Response.json({ error: message }, { status, headers: NO_STORE });

type Row = { storage_key: string; content_type: string; bytes: number; uploaded_at: string | null; ownerId: string; open: boolean };

async function load(kind: EvidenceKind, id: string) {
  const supabase = await createClient();
  // RLS: 올린 사람 · 운영자만 행을 읽는다
  if (kind === "report") {
    const { data, error } = await supabase
      .from("report_evidence")
      .select("storage_key, content_type, bytes, uploaded_at, parent:reports!inner(reporter_id, status)")
      .eq("id", id)
      .maybeSingle();
    const row: Row | null = data && { ...data, ownerId: data.parent.reporter_id, open: data.parent.status === "open" };
    return { supabase, row, error };
  }
  const { data, error } = await supabase
    .from("appeal_evidence")
    .select("storage_key, content_type, bytes, uploaded_at, parent:appeals!inner(author_id, status)")
    .eq("id", id)
    .maybeSingle();
  const row: Row | null = data && { ...data, ownerId: data.parent.author_id, open: data.parent.status === "open" };
  return { supabase, row, error };
}

export async function putEvidence(kind: EvidenceKind, request: NextRequest, id: string): Promise<Response> {
  if (!isUuid(id)) return fail(400, "잘못된 주소");
  // 쿠키 인증 API이므로 같은 사이트에서 온 요청만 받는다 (CSRF 방지)
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if ((site !== null && site !== "same-origin") || (origin !== null && origin !== request.nextUrl.origin)) {
    return fail(403, "허용되지 않은 요청");
  }
  const viewer = await getViewer();
  if (!viewer) return fail(401, "로그인이 필요해요");

  const { supabase, row, error } = await load(kind, id);
  if (error) return fail(500, "정보를 읽지 못했어요");
  if (!row || row.ownerId !== viewer.id) return fail(404, "자리를 찾을 수 없어요");
  if (row.uploaded_at !== null) return fail(409, "이미 올린 파일이에요");
  if (!row.open) return fail(409, "처리가 끝났어요");
  const key = evidenceObjectKey(row.storage_key);
  if (!key) return fail(500, "저장 위치가 올바르지 않아요");

  // 용량은 본문을 읽기 전에 먼저 막는다
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "파일 크기가 필요해요");
  if (declared !== row.bytes) return fail(413, "파일 크기가 맞지 않아요");
  const body = await request.arrayBuffer();
  if (body.byteLength !== row.bytes) return fail(400, "파일 크기가 맞지 않아요");
  if (sniffEvidence(body) !== row.content_type) return fail(415, "JPEG · PNG · WebP 사진만 올릴 수 있어요");

  await (await photoStore()).put(key, body, row.content_type);
  const finished =
    kind === "report"
      ? await supabase.rpc("finish_report_evidence", { target: id })
      : await supabase.rpc("finish_appeal_evidence", { target: id });
  if (finished.error || !finished.data) return fail(409, "올리기를 마치지 못했어요");
  return new Response(null, { status: 204, headers: NO_STORE });
}

export async function getEvidence(kind: EvidenceKind, id: string): Promise<Response> {
  if (!isUuid(id)) return fail(400, "잘못된 주소");
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return fail(404, "찾을 수 없어요");

  const { row, error } = await load(kind, id);
  if (error) return fail(500, "정보를 읽지 못했어요");
  const key = row?.uploaded_at ? evidenceObjectKey(row.storage_key) : null;
  if (!row || !key) return fail(404, "찾을 수 없어요");

  const object = await (await photoStore()).get(key);
  if (!object) return fail(404, "파일이 없어요");
  return new Response(object.body, {
    headers: {
      ...NO_STORE,
      "Content-Type": row.content_type,
      "Content-Length": String(object.size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
