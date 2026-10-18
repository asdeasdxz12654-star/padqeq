"use client";

import { useState, useTransition } from "react";
import { approveTag } from "./actions";

export function ApproveButton({ tagId, name }: { tagId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-label={`${name} 태그 승인`}
        onClick={() =>
          startTransition(async () => {
            const result = await approveTag(tagId);
            setError(result.ok ? null : result.error);
          })
        }
        className="min-h-9 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "승인 중…" : "승인"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
