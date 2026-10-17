import { PageSkeleton } from "@/components/skeletons";

// 홈 화면을 옮길 때 서버 응답 전까지 보이는 틀 (홈만: 루트에 두면 없는 주소도 200이 된다)
export default function Loading() {
  return <PageSkeleton />;
}
