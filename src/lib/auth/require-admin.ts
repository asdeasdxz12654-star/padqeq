import "server-only";
import { notFound } from "next/navigation";
import { getViewer } from "./viewer";

/** 최고 관리자 전용 운영 화면. 운영 도우미에게는 화면이 있다는 것도 드러내지 않는다 (404). */
export async function requireTopAdmin(): Promise<void> {
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") notFound();
}
