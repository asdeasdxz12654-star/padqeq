"use client";

import { useState } from "react";

export type ThemeChoice = "dark" | "light" | "system";
const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "dark", label: "다크 (기본)" },
  { value: "light", label: "라이트" },
  { value: "system", label: "기기 설정 따르기" },
];

/** 화면 테마 (P-03 다크 모드 · 직접 변경). 이 기기에만 저장된다 (쿠키). */
export function ThemeForm({ current }: { current: ThemeChoice }) {
  const [theme, setTheme] = useState(current);
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">화면 테마</legend>
      {OPTIONS.map((o) => (
        <label
          key={o.value}
          className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm has-checked:border-text has-checked:bg-text has-checked:text-bg"
        >
          <input
            type="radio"
            name="theme"
            checked={theme === o.value}
            onChange={() => {
              setTheme(o.value);
              document.cookie = `theme=${o.value}; path=/; max-age=31536000; samesite=lax; secure`;
              document.documentElement.dataset.theme = o.value;
            }}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
