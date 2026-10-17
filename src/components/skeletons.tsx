// 불러오는 중 화면: 누르는 즉시 그 화면 모양의 회색 틀을 먼저 보여 준다 (서버 응답을 기다리며 멈춘 것처럼 보이지 않게).
// 화면 읽기 프로그램에는 "불러오는 중"만 알린다.

const bar = "rounded-md bg-slot motion-safe:animate-pulse";

/** 목록 · 피드 화면 공통: 제목 · 칩 줄 · 사진 카드 */
export function PageSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 pt-6 pb-16 md:px-6">
      <span className="sr-only" role="status">
        불러오는 중
      </span>
      <div className={`${bar} h-7 w-40`} />
      <div className="flex gap-2">
        <div className={`${bar} h-9 w-16 rounded-full`} />
        <div className={`${bar} h-9 w-20 rounded-full`} />
        <div className={`${bar} h-9 w-16 rounded-full`} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className={`${bar} aspect-[4/5] rounded-lg`} />
            <div className={`${bar} h-4 w-3/4`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 게시물 상세: 사진 자리 + 정보 칸 */
export function PostSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto grid max-w-[1440px] gap-6 px-0 pb-10 md:grid-cols-[minmax(0,1fr)_380px] md:px-6 md:pt-6">
      <span className="sr-only" role="status">
        불러오는 중
      </span>
      <div className={`${bar} aspect-[4/5] max-h-[80vh] w-full rounded-none md:aspect-auto md:h-[70vh] md:rounded-xl`} />
      <div className="flex flex-col gap-3 px-4 md:px-0">
        <div className={`${bar} h-7 w-2/3`} />
        <div className={`${bar} h-4 w-1/2`} />
        <div className="flex gap-2">
          <div className={`${bar} h-11 w-24 rounded-full`} />
          <div className={`${bar} h-11 w-20 rounded-full`} />
          <div className={`${bar} h-11 w-20 rounded-full`} />
        </div>
        <div className={`${bar} h-16 w-full`} />
      </div>
    </div>
  );
}
