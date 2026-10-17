import { PostOverlay } from "@/components/post-overlay";
import { PostSkeleton } from "@/components/skeletons";

// 피드에서 게시물을 누르면 겹친 창이 바로 열리고, 내용이 올 때까지 틀을 보여 준다
export default function Loading() {
  return (
    <PostOverlay>
      <PostSkeleton />
    </PostOverlay>
  );
}
