import Link from "next/link";
import { TAG_KIND_LABEL, type TagKind } from "@/lib/tags/tag-rules";

/** 태그 허브로 가는 칩. 주소는 /t/<slug> (한글은 브라우저가 알아서 인코딩) */
export function TagChip({ tag, showKind = false }: { tag: { slug: string; name: string; kind: TagKind }; showKind?: boolean }) {
  return (
    <Link
      href={`/t/${encodeURIComponent(tag.slug)}`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm hover:border-quiet"
    >
      {showKind && <span className="text-xs text-quiet">{TAG_KIND_LABEL[tag.kind]}</span>}
      {tag.kind === "general" ? `#${tag.name}` : tag.name}
    </Link>
  );
}
