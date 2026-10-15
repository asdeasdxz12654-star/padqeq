// 회원별 한 달 업로드 한도 (A-05 ③). 값은 운영자가 바꾸고 DB 트리거가 확인한다.
export const MONTHLY_LIMIT_MESSAGE = "이번 달에 올릴 수 있는 사진 수를 넘었어요. 다음 달 1일(한국 시간)부터 다시 올릴 수 있어요.";
export const isMonthlyLimitError = (message: string | undefined) => Boolean(message?.includes("monthly_upload_limit"));
