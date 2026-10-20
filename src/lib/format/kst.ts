// 한국 시간(Asia/Seoul) 날짜 · 시각 표시. 화면마다 따로 만들지 않고 여기서 가져다 쓴다.
// (사진 촬영 시각처럼 찍은 곳의 시간을 그대로 보여야 하는 곳은 쓰지 않는다)

const kst = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...options });

export const KST = {
  /** 2026. 10. 20. */
  date: kst({ dateStyle: "medium" }),
  /** 2026년 10월 20일 */
  dateLong: kst({ dateStyle: "long" }),
  /** 2026. 10. 20. 오후 2:30 */
  dateTime: kst({ dateStyle: "medium", timeStyle: "short" }),
  /** 2026. 10. 20. 오후 2:30:05 (감사 기록) */
  dateTimeSeconds: kst({ dateStyle: "medium", timeStyle: "medium" }),
  /** 26. 10. 20. 오후 2:30 */
  dateTimeShort: kst({ dateStyle: "short", timeStyle: "short" }),
  /** 2026년 10월 20일 오후 2:30 */
  dateTimeLong: kst({ dateStyle: "long", timeStyle: "short" }),
  /** 10. 20. 오후 02:30 */
  monthDayTime: kst({ month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
  /** 10월 20일 오후 02:30 */
  monthDayTimeLong: kst({ month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
  /** 10. 20. */
  monthDay: kst({ month: "numeric", day: "numeric" }),
  /** 10. 20. (두 자리) */
  monthDay2: kst({ month: "2-digit", day: "2-digit" }),
  /** 2026년 */
  year: kst({ year: "numeric" }),
};
