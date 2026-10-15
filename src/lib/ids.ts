// 주소 · 입력으로 들어온 id 확인 (DB의 uuid 형식, 소문자)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
