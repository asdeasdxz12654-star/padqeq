"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "./actions";

const inputClass = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";

export function ProfileForm({ displayName, bio, links }: { displayName: string; bio: string; links: string[] }) {
  const [name, setName] = useState(displayName);
  const [about, setAbout] = useState(bio);
  const [urls, setUrls] = useState(() => [0, 1, 2].map((i) => links[i] ?? ""));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = name !== displayName || about !== bio || urls.join("\n") !== [0, 1, 2].map((i) => links[i] ?? "").join("\n");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await updateProfile({ displayName: name, bio: about, links: urls });
          setMessage(result.ok ? { ok: true, text: "저장했어요." } : { ok: false, text: result.error ?? "저장하지 못했어요." });
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        표시 이름
        <input value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        소개 <span className="text-xs font-normal text-quiet">(주로 하는 작품 · 활동 등, 300자까지)</span>
        <textarea
          value={about}
          maxLength={300}
          rows={4}
          onChange={(e) => setAbout(e.target.value)}
          className={`${inputClass} py-2`}
        />
      </label>
      <fieldset className="flex flex-col gap-1.5 text-sm font-medium">
        <legend className="mb-1.5">
          외부 링크 <span className="text-xs font-normal text-quiet">(SNS 등 3개까지 · https:// · 미가입자로 적힌 크레딧을 연결할 때 본인 확인에도 써요)</span>
        </legend>
        {urls.map((url, i) => (
          <input
            key={i}
            type="url"
            value={url}
            maxLength={200}
            placeholder="https://instagram.com/내계정"
            aria-label={`외부 링크 ${i + 1}`}
            onChange={(e) => setUrls((all) => all.map((v, j) => (j === i ? e.target.value : v)))}
            className={inputClass}
          />
        ))}
      </fieldset>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-emerald-400" : "text-red-300"}`}>
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !changed}
        className="min-h-11 self-start rounded-xl bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
