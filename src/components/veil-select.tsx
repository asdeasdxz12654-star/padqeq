import { VEIL_LABEL, VEIL_REASONS, type VeilReason } from "@/lib/posts/veil-reasons";

/** 가림 표시 고르기 (업로드 · 편집). 운영자가 붙인 가림은 업로더가 바꿀 수 없다. */
export function VeilSelect({
  value,
  onChange,
  disabled = false,
  locked = false,
  className,
}: {
  value: VeilReason | null;
  onChange(next: VeilReason | null): void;
  disabled?: boolean;
  locked?: boolean;
  className: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      가림 표시
      <select
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as VeilReason | null)}
        disabled={disabled || locked}
        className={className}
      >
        <option value="">가리지 않음 (피 · 공포 · 혐오 소재가 아니면)</option>
        {VEIL_REASONS.map((r) => (
          <option key={r} value={r}>
            {VEIL_LABEL[r].title}
          </option>
        ))}
      </select>
      {/* 설명은 고른 뒤에만 (고르기 전에는 고르는 칸 이름만) */}
      {(locked || value) && (
        <span className="text-xs text-quiet">
          {locked ? "운영자가 붙인 가림 표시라 바꿀 수 없어요. 이의가 있으면 1:1 문의를 남겨 주세요." : "흐리게 가리고, 보는 사람이 눌러야 보여요."}
        </span>
      )}
    </label>
  );
}
