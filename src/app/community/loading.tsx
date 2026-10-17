import { PageSkeleton } from "@/components/skeletons";

// 화면을 옮길 때 서버 응답 전까지 보이는 틀. 맨 위(루트)에 두면 없는 주소도 200이 되어 화면 묶음마다 둔다.
export default function Loading() {
  return <PageSkeleton />;
}
