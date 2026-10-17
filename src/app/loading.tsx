import { PageSkeleton } from "@/components/skeletons";

// 화면을 옮길 때 서버 응답 전까지 보이는 틀 (화면마다 따로 두지 않은 곳 공통)
export default function Loading() {
  return <PageSkeleton />;
}
