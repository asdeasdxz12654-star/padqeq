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
      가림 표시 <span className="text-xs text-quiet">(선택)</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as VeilReason | null)}
        disabled={disabled || locked}
        className={className}
      >
        <option value="">가리지 않음</option>
        {VEIL_REASONS.map((r) => (
          <option key={r} value={r}>
            {VEIL_LABEL[r].title}
          </option>
        ))}
      </select>
      <span className="text-xs text-quiet">
        {locked
          ? "운영자가 붙인 가림 표시라 바꿀 수 없어요. 이의가 있으면 1:1 문의를 남겨 주세요."
          : value
            ? `${VEIL_LABEL[value].help}. 사진을 흐리게 가리고, 보는 사람이 눌러야 보여요.`
            : "피 · 공포 분장처럼 보기 불편할 수 있는 사진이면 골라 주세요. 성인 콘텐츠는 올릴 수 없어요."}
      </span>
    </label>
  );
}
