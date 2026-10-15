// 화면 단축키 (S-07 ⑦): 글을 쓰는 중이거나 창(dialog)이 열려 있으면 가로채지 않는다.
// 게시물을 겹쳐 연 동안(data-overlay)에는 그 안의 단축키만 동작한다 (뒤 화면이 같은 키에 반응하지 않게).

export function shortcutAllowed(e: KeyboardEvent, scope?: Element | null): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return false;
  const target = e.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable]"))) return false;
  if (document.querySelector("dialog[open]") !== null) return false;
  const overlay = document.querySelector("[data-overlay]");
  return overlay === null || (scope !== undefined && scope !== null && overlay.contains(scope));
}

/** 대소문자 · 한글 자판(ㅣ ㄴ)을 함께 본다 */
export function isKey(e: KeyboardEvent, latin: string, hangul: string): boolean {
  return e.key.toLowerCase() === latin || e.key === hangul;
}
