import { describe, expect, it } from "vitest";
import { formatLatLng, markerRadius, parseLatLng, pickedLatLng } from "./location";

describe("좌표 읽기", () => {
  it("숫자 두 개", () => {
    expect(parseLatLng("37.5665, 126.9780")).toEqual({ lat: 37.5665, lng: 126.978 });
    expect(parseLatLng(" 37.5665 126.978 ")).toEqual({ lat: 37.5665, lng: 126.978 });
    expect(parseLatLng("-33.8688,151.2093")).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it("지도 주소", () => {
    expect(parseLatLng("https://www.google.com/maps/place/x/@37.5112907,127.0592779,17z/data")).toEqual({ lat: 37.51129, lng: 127.05928 });
    expect(parseLatLng("https://maps.google.com/?q=35.1796,129.0756")).toEqual({ lat: 35.1796, lng: 129.0756 });
    expect(parseLatLng("https://www.openstreetmap.org/#map=16/37.5796/126.9770")).toEqual({ lat: 37.5796, lng: 126.977 });
  });

  it("범위 밖 · 이상한 값은 null", () => {
    expect(parseLatLng("95, 127")).toBeNull();
    expect(parseLatLng("37.5, 190")).toBeNull();
    expect(parseLatLng("서울시청")).toBeNull();
    expect(parseLatLng("")).toBeNull();
    expect(parseLatLng("37.5")).toBeNull();
  });

  it("지도를 눌러 고른 자리", () => {
    expect(pickedLatLng(37.566535, 126.977969)).toEqual({ lat: 37.56654, lng: 126.97797 });
    // 지도를 한 바퀴 돌린 뒤 누른 경도
    expect(pickedLatLng(37.5, 486.978)).toEqual({ lat: 37.5, lng: 126.978 });
    expect(pickedLatLng(37.5, -233.022)).toEqual({ lat: 37.5, lng: 126.978 });
    expect(pickedLatLng(91, 127)).toBeNull();
    // 고른 자리를 입력칸에 넣으면 그대로 다시 읽힌다
    expect(parseLatLng(formatLatLng({ lat: 37.56654, lng: 126.97797 }))).toEqual({ lat: 37.56654, lng: 126.97797 });
  });

  it("원 크기", () => {
    expect(markerRadius(0)).toBe(6);
    expect(markerRadius(4)).toBe(10);
    expect(markerRadius(10_000)).toBe(18);
  });
});
