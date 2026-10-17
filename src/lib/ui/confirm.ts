// 공통 확인 창 (브라우저 기본 확인 창 대신). PC는 가운데 창, 휴대폰은 아래에서 올라오는 시트.
// <dialog>를 써서 포커스 가두기 · Esc 닫기(= 취소)는 브라우저가 맡는다. 글은 textContent로만 넣는다.

export type ConfirmOptions = {
  /** 제목 (예: "이 댓글을 지울까요?") */
  title: string;
  /** 한두 줄 설명 */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 지우기 · 차단처럼 되돌리기 어려운 일: 확인 버튼을 빨강으로 */
  danger?: boolean;
};

const BUTTON = "min-h-11 flex-1 rounded-full px-5 text-sm font-bold md:flex-none";

export function confirmAction({ title, body, confirmLabel = "확인", cancelLabel = "취소", danger = false }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-labelledby", "confirm-title");
    dialog.className =
      "mx-0 mt-auto mb-0 w-full max-w-none rounded-t-2xl border-0 bg-bg p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-text shadow-2xl backdrop:bg-black/50 md:m-auto md:max-w-md md:rounded-2xl md:p-6";

    const heading = document.createElement("h2");
    heading.id = "confirm-title";
    heading.className = "text-lg font-bold";
    heading.textContent = title;
    dialog.append(heading);

    if (body) {
      const text = document.createElement("p");
      text.className = "mt-2 text-sm leading-relaxed text-quiet";
      text.textContent = body;
      dialog.append(text);
    }

    const actions = document.createElement("div");
    actions.className = "mt-5 flex gap-2 md:justify-end";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = `${BUTTON} border border-line bg-bg text-text`;
    cancel.textContent = cancelLabel;
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = `${BUTTON} ${danger ? "bg-accent text-on-accent" : "bg-text text-bg"}`;
    ok.textContent = confirmLabel;
    actions.append(cancel, ok);
    dialog.append(actions);

    let answer = false;
    cancel.addEventListener("click", () => dialog.close());
    ok.addEventListener("click", () => {
      answer = true;
      dialog.close();
    });
    // 바깥(어두운 곳)을 누르면 취소
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer);
    });

    document.body.append(dialog);
    dialog.showModal();
    // 실수로 지우지 않게 위험한 일은 '취소'에 먼저 초점
    (danger ? cancel : ok).focus();
  });
}
