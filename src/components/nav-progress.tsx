"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * 화면을 옮길 때 누르는 즉시 맨 위에 얇은 진행 막대 (서버 응답을 기다리는 동안 멈춘 것처럼 보이지 않게).
 * 같은 사이트 안 링크를 누르면 시작하고, 주소가 바뀌면 끝난다. 새 탭 · 다운로드 · 같은 화면 안 이동(#)은 건드리지 않는다.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);

  // 주소가 바뀌면(이동 끝) 막대를 내린다
  const [last, setLast] = useState(pathname + "?" + search);
  const now = pathname + "?" + search;
  if (now !== last) {
    setLast(now);
    setPending(false);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Next 링크는 눌리면 기본 동작을 막고 직접 이동하므로, 링크보다 먼저(capture) 듣고 defaultPrevented는 보지 않는다
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setPending(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 이동이 취소되거나 오래 걸려도 막대가 남지 않게
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), 12_000);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!pending) return null;
  return (
    <div role="progressbar" aria-label="화면 불러오는 중" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden">
      <div className="nav-progress h-full w-1/3 bg-sun" />
    </div>
  );
}
