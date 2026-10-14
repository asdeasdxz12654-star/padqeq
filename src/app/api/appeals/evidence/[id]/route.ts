import type { NextRequest } from "next/server";
import { getEvidence, putEvidence } from "@/lib/moderation/evidence-route";

// 소명 증빙 (S-19 ⑦): 작성자가 올리고(PUT) 운영자만 연다(GET)
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/appeals/evidence/[id]">) {
  return putEvidence("appeal", request, (await ctx.params).id);
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/appeals/evidence/[id]">) {
  return getEvidence("appeal", (await ctx.params).id);
}
