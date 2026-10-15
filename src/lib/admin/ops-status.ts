import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@/lib/supabase/server";

// 운영 상태 (A-01 ⑦ ⑨): DB 백업 · 멈춘 업로드.
// DB 백업: GitHub Actions가 매일 db/YYYY-MM-DD/ 아래에 암호화해 올린다 (.github/workflows/db-backup.yml).

type R2List = { objects: { key: string; size: number; uploaded: Date }[]; truncated: boolean };
type BackupBucket = { list(options: { prefix: string; limit?: number }): Promise<R2List> };

export type BackupInfo = { latest: { at: string; size: number } | null; totalBytes: number; days: number };

/** 가장 최근 백업 · 전체 용량 (30일 보관). 버킷을 못 읽으면(로컬 개발 등) null */
export async function getBackupInfo(): Promise<BackupInfo | null> {
  let bucket: BackupBucket | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    bucket = (env as { BACKUPS?: BackupBucket }).BACKUPS;
  } catch {
    return null;
  }
  if (!bucket) return null;
  try {
    const { objects } = await bucket.list({ prefix: "db/", limit: 1000 });
    const latest = objects.reduce<(typeof objects)[number] | null>((a, b) => (!a || b.uploaded > a.uploaded ? b : a), null);
    return {
      latest: latest ? { at: latest.uploaded.toISOString(), size: latest.size } : null,
      totalBytes: objects.reduce((n, o) => n + o.size, 0),
      days: new Set(objects.map((o) => o.key.split("/")[1])).size,
    };
  } catch {
    return null;
  }
}

/** 하루 넘게 게시하지 않은 초안 수 (올리다 멈춘 업로드, 7일 뒤 자동 정리). 운영자는 RLS상 모든 초안을 본다. */
export async function countStuckDrafts(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft")
    .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  return count ?? 0;
}
