import type { NextRequest } from "next/server";
import { getEvidence, putEvidence } from "@/lib/moderation/evidence-route";

// 신고 증거 사진 (S-15 ⑦): 신고자가 올리고(PUT) 운영자만 연다(GET)
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reports/evidence/[id]">) {
  return putEvidence("report", request, (await ctx.params).id);
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/reports/evidence/[id]">) {
  return getEvidence("report", (await ctx.params).id);
}
