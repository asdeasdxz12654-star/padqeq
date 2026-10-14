"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Constants } from "@/lib/supabase/database.types";
import { INQUIRY_CATEGORY_LABEL, type InquiryCategory } from "@/lib/support/labels";
import { submitInquiry } from "./actions";

export function InquiryForm({ errorRef }: { errorRef: string | null }) {
  const router = useRouter();
  const [category, setCategory] = useState<InquiryCategory>(errorRef ? "other" : "account");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await submitInquiry({ category, body, errorRef });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setBody("");
          setSent(true);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        분류
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as InquiryCategory)}
          className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base"
        >
          {Constants.public.Enums.inquiry_category.map((c) => (
            <option key={c} value={c}>
              {INQUIRY_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        내용
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setSent(false);
          }}
          minLength={5}
          maxLength={2000}
          rows={6}
          required
          placeholder="무엇을 도와드릴까요? 게시물 주소가 있으면 함께 적어 주세요."
          className="rounded-xl border border-line bg-bg px-3 py-2 text-base"
        />
      </label>
      {errorRef && <p className="text-xs text-quiet">오류 번호 {errorRef}가 함께 전달돼요.</p>}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="text-sm text-emerald-400">
          문의를 남겼어요. 답변이 달리면 알려 드릴게요.
        </p>
      )}
      <button
        type="submit"
        disabled={body.trim().length < 5 || pending}
        className="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "보내는 중…" : "문의하기"}
      </button>
    </form>
  );
}
