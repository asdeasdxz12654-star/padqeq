import type { ReactNode } from "react";

/** 약관 · 개인정보처리방침 공용 레이아웃 (읽기 쉬운 줄 길이 · 조항 간격) */
export function PolicyDoc({ title, effective, children }: { title: string; effective: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-4 pt-10 pb-16 text-[15px] leading-relaxed md:px-6 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_table]:mt-3 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:border-line [&_th]:bg-surface [&_th]:p-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-quiet">시행일 {effective}</p>
      {children}
    </article>
  );
}
