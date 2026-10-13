"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "./actions";

/**
 * 알림 화면을 열면 보인 알림을 읽음 처리한다. 링크 미리 가져오기로는 읽음 처리되지 않도록 화면에서 실행한다.
 * 서버 액션의 revalidatePath가 상단 바 숫자까지 새로 그린다.
 */
export function MarkRead({ upToId }: { upToId: number }) {
  useEffect(() => {
    void markNotificationsRead(upToId);
  }, [upToId]);
  return null;
}
