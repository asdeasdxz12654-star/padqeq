"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { removeCreatorProfile, saveCreatorProfile } from "@/app/me/creator/actions";
import { updateProfile } from "@/app/me/actions";
import { setProfileFeature } from "@/app/p/[id]/actions";
import { ProtectedPhoto } from "@/components/protected-photo";
import { REGIONS } from "@/lib/events/calendar";
import { CREDIT_ROLE_LABEL } from "@/lib/photos/credit-input";
import type { FeedItem } from "@/lib/posts/feed";
import { AVATAR_SIZE, avatarUrl } from "@/lib/profiles/avatar";
import { confirmAction } from "@/lib/ui/confirm";

const ROLES = ["cosplayer", "photographer", "model", "retoucher"] as const;
type Role = (typeof ROLES)[number];

export type CreatorDraft = {
  listed: boolean;
  roles: Role[];
  region: string;
  activeSince: string;
  works: string;
  castingOpen: boolean;
};

export type ProfileInitial = {
  avatarKey: string | null;
  coverPostId: string | null;
  displayName: string;
  bio: string;
  links: string[];
  creator: CreatorDraft;
  creatorExists: boolean;
};

// 프로필 사진: 그대로 · 새 사진(아직 올리지 않음) · 내리기
type AvatarChange = { kind: "keep" } | { kind: "new"; body: Uint8Array; preview: string } | { kind: "remove" };

const inputClass = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";
const sub = "text-base font-semibold";
const sameCreator = (a: CreatorDraft, b: CreatorDraft) => JSON.stringify(a) === JSON.stringify(b);
const padLinks = (links: string[]) => [0, 1, 2].map((i) => links[i] ?? "");

/**
 * 설정 › 프로필 수정: 프로필 사진 · 커버 · 이름 · 소개 · 링크 · 크리에이터 정보를 고친 뒤 맨 아래 [프로필 저장] 한 번으로 저장한다.
 * 바뀐 것만 보낸다. 저장 전에 화면을 떠나려 하면 묻는다.
 */
export function ProfileEditor({
  handle,
  initial,
  posts,
  adult,
  currentYear,
}: {
  handle: string;
  initial: ProfileInitial;
  posts: FeedItem[];
  adult: boolean;
  currentYear: number;
}) {
  const router = useRouter();
  const [avatar, setAvatar] = useState<AvatarChange>({ kind: "keep" });
  const [cover, setCover] = useState(initial.coverPostId);
  const [name, setName] = useState(initial.displayName);
  const [about, setAbout] = useState(initial.bio);
  const [urls, setUrls] = useState(() => padLinks(initial.links));
  const [creator, setCreator] = useState(initial.creator);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const infoChanged = name !== initial.displayName || about !== initial.bio || urls.join("\n") !== padLinks(initial.links).join("\n");
  const creatorChanged = !sameCreator(creator, initial.creator);
  const changed = avatar.kind !== "keep" || cover !== initial.coverPostId || infoChanged || creatorChanged;
  const setField = <K extends keyof CreatorDraft>(key: K, value: CreatorDraft[K]) => setCreator((d) => ({ ...d, [key]: value }));

  // 저장하지 않고 떠나면 고친 내용이 사라진다
  useEffect(() => {
    if (!changed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  // 미리보기 주소는 바뀌거나 화면을 떠날 때 정리한다
  useEffect(() => {
    if (avatar.kind !== "new") return;
    return () => URL.revokeObjectURL(avatar.preview);
  }, [avatar]);

  const pickAvatar = async (file: File) => {
    setMessage(null);
    try {
      const body = await toAvatarAvif(file);
      setAvatar({ kind: "new", body, preview: URL.createObjectURL(new Blob([body as BlobPart], { type: "image/avif" })) });
    } catch {
      setMessage({ ok: false, text: "이 사진은 쓸 수 없어요. 다른 사진으로 해 보세요." });
    }
  };

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      // 크리에이터 정보는 역할을 하나라도 고른 경우에만 (처음 쓰는 사람이 아무것도 안 골랐으면 건너뛴다)
      if (creatorChanged && creator.roles.length === 0 && (initial.creatorExists || creator.region || creator.works || creator.activeSince || creator.castingOpen)) {
        setMessage({ ok: false, text: "크리에이터 정보: 역할을 하나 이상 골라 주세요." });
        return;
      }
      const failed: string[] = [];
      if (avatar.kind === "new") {
        const res = await fetch("/api/avatar", { method: "PUT", body: new Blob([avatar.body as BlobPart]) });
        const data = (await res.json().catch(() => null)) as { key?: string; error?: string } | null;
        if (res.ok && data?.key) setAvatar({ kind: "keep" });
        else failed.push(`프로필 사진(${data?.error ?? "올리지 못했어요"})`);
      } else if (avatar.kind === "remove") {
        const res = await fetch("/api/avatar", { method: "DELETE" });
        if (res.ok) setAvatar({ kind: "keep" });
        else failed.push("프로필 사진(내리지 못했어요)");
      }
      if (cover !== initial.coverPostId) {
        const target = cover ?? initial.coverPostId;
        const result = target ? await setProfileFeature(target, "cover", cover !== null) : { ok: true as const };
        if (!result.ok) failed.push(`커버(${result.error})`);
      }
      if (infoChanged) {
        const result = await updateProfile({ displayName: name, bio: about, links: urls });
        if (!result.ok) failed.push(result.error ?? "이름 · 소개");
      }
      if (creatorChanged && creator.roles.length > 0) {
        const result = await saveCreatorProfile(creator);
        if (!result.ok) failed.push(`크리에이터 정보(${result.error})`);
      }
      setMessage(failed.length ? { ok: false, text: `저장하지 못한 것: ${failed.join(" · ")}` } : { ok: true, text: "프로필을 저장했어요." });
      router.refresh();
    });

  const shownAvatar = avatar.kind === "new" ? avatar.preview : avatar.kind === "remove" ? null : avatarUrl(initial.avatarKey);

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex flex-col gap-3">
        <h3 className={sub}>프로필 사진</h3>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            aria-label={shownAvatar ? "프로필 사진 바꾸기" : "프로필 사진 고르기"}
            className="size-20 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line bg-slot"
          >
            {shownAvatar ? (
              // 내 사진이라 이미지 게이트를 거치지 않는다 (next/image도 쓰지 않는 앱 규칙)
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownAvatar} alt="" width={AVATAR_SIZE} height={AVATAR_SIZE} className="size-full object-cover" />
            ) : (
              <span aria-hidden="true" className="flex size-full items-center justify-center text-xs text-quiet">
                사진 고르기
              </span>
            )}
          </button>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={pending}
                className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-quiet"
              >
                {shownAvatar ? "사진 바꾸기" : "사진 고르기"}
              </button>
              {shownAvatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(initial.avatarKey ? { kind: "remove" } : { kind: "keep" })}
                  disabled={pending}
                  className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm text-quiet hover:border-quiet hover:text-text"
                >
                  내리기
                </button>
              )}
            </div>
            <p className="text-sm text-quiet">가운데를 기준으로 정사각형으로 잘려요. 올리지 않으면 빈 자리로 둬요.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void pickAvatar(file);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={sub}>커버 사진</h3>
        <p className="-mt-2 text-sm text-quiet">프로필 맨 위에 넓게 걸리는 사진이에요. 고른 사진을 다시 누르면 내려요.</p>
        {posts.length === 0 ? (
          <p className="text-sm text-quiet">올린 사진이 있어야 커버를 걸 수 있어요.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {posts.map((post) => {
              const chosen = cover === post.id;
              return (
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => setCover(chosen ? null : post.id)}
                    disabled={pending}
                    aria-pressed={chosen}
                    className="block w-full cursor-pointer overflow-hidden rounded-xl border-2 border-transparent bg-slot aria-pressed:border-accent [&_picture]:h-full"
                  >
                    <span className="block aspect-[3/2]">
                      {post.cover && !post.cover.veil && (
                        <ProtectedPhoto
                          sources={post.cover.sources}
                          alt={post.title}
                          width={post.cover.width}
                          height={post.cover.height}
                          sizes="160px"
                          className="block size-full object-cover"
                        />
                      )}
                    </span>
                    <span className="sr-only">
                      {post.title} {chosen ? "— 커버로 골랐어요. 누르면 내려요" : "— 누르면 커버로 골라요"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className={sub}>이름 · 소개 · 링크</h3>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          표시 이름
          <input value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          소개 <span className="text-xs font-normal text-quiet">(주로 하는 작품 · 활동 등, 300자까지)</span>
          <textarea value={about} maxLength={300} rows={4} onChange={(e) => setAbout(e.target.value)} className={`${inputClass} py-2`} />
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
        <p className="text-xs text-quiet">핸들(@{handle})은 크레딧 태그의 기준이라 바꿀 수 없어요.</p>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className={sub}>크리에이터 정보</h3>
        <p className="-mt-2 text-sm leading-relaxed text-quiet">
          역할 · 지역 · 섭외 가능을 프로필과{" "}
          <Link href="/creators" className="underline underline-offset-2">
            크리에이터 찾기
          </Link>
          에 보여요. 역할을 고른 경우에만 보이고, 언제든 끄거나 지울 수 있어요.
        </p>
        <fieldset>
          <legend className="mb-1.5 text-sm">역할</legend>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <label key={r} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-text has-checked:bg-text has-checked:text-bg">
                <input
                  type="checkbox"
                  checked={creator.roles.includes(r)}
                  onChange={(e) => setField("roles", e.target.checked ? [...creator.roles, r] : creator.roles.filter((x) => x !== r))}
                  className="sr-only"
                />
                {CREDIT_ROLE_LABEL[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            지역 <span className="text-xs text-quiet">(선택)</span>
            <select value={creator.region} onChange={(e) => setField("region", e.target.value)} className={inputClass}>
              <option value="">밝히지 않음</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            활동 시작 연도 <span className="text-xs text-quiet">(선택)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1990}
              max={currentYear}
              value={creator.activeSince}
              onChange={(e) => setField("activeSince", e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          주로 하는 작품 <span className="text-xs text-quiet">(선택 · 100자)</span>
          <input value={creator.works} onChange={(e) => setField("works", e.target.value)} maxLength={100} placeholder="예: 원신 · 블루 아카이브" className={inputClass} />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={creator.castingOpen}
            disabled={!adult}
            onChange={(e) => setField("castingOpen", e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            섭외 가능 표시
            <span className="block text-xs text-quiet">
              {adult ? "디렉토리에서 '섭외 가능만'으로 찾을 수 있어요." : "만 19세 이상 확인을 한 회원만 켤 수 있어요 (섭외 게시판에서 확인)."}
            </span>
          </span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={creator.listed} onChange={(e) => setField("listed", e.target.checked)} className="size-4 accent-[var(--accent)]" />
          크리에이터 찾기에 보이기
        </label>
        {initial.creatorExists && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!(await confirmAction({ title: "크리에이터 정보를 지울까요?", body: "크리에이터 찾기에서 빠져요.", confirmLabel: "지우기", danger: true }))) return;
              startTransition(async () => {
                const result = await removeCreatorProfile();
                setMessage(result.ok ? { ok: true, text: "크리에이터 정보를 지웠어요." } : { ok: false, text: result.error });
                router.refresh();
              });
            }}
            className="min-h-10 self-start text-sm text-quiet underline underline-offset-4 hover:text-danger"
          >
            크리에이터 정보 지우기
          </button>
        )}
      </div>

      {/* 맨 아래 저장 줄: 휴대폰에서는 화면 아래에 붙어 있다 */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:px-0">
        <button
          type="submit"
          disabled={pending || !changed}
          className="min-h-11 rounded-xl bg-accent px-6 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "저장 중…" : "프로필 저장"}
        </button>
        <p role="status" className={`min-w-0 flex-1 text-sm ${message ? (message.ok ? "text-ok" : "text-danger") : "text-quiet"}`}>
          {message?.text ?? (changed ? "저장하지 않은 변경이 있어요." : "")}
        </p>
      </div>
    </form>
  );
}

/** 고른 사진을 가운데 기준 정사각형으로 잘라 256px AVIF로 (서버가 다시 확인한다) */
async function toAvatarAvif(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(AVATAR_SIZE, AVATAR_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("그릴 수 없어요");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  const { encodeAvif } = await import("@/app/upload/avif-encoder");
  return encodeAvif(ctx.getImageData(0, 0, AVATAR_SIZE, AVATAR_SIZE), { quality: 65, speed: 7 });
}
