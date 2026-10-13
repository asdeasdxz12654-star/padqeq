// RAW 파일 안에 들어 있는 미리보기 JPEG 찾기 (P-01: "내장 미리보기가 2560px 이상이면 그것을").
// 카메라 제조사마다 구조가 달라(TIFF · ISO BMFF · Fuji 등) 형식별로 파싱하지 않고,
// 파일 전체에서 JPEG 시작(FFD8FF)을 찾아 JPEG 구조를 따라가며 끝(FFD9)까지 잘라 낸다.
// 그중 가장 큰 것을 고른다. RAW 파일 자체는 서버로 보내지 않는다.

export const RAW_EXTENSIONS = /\.(cr2|cr3|nef|arw|raf|rw2|orf|dng)$/i;

export type EmbeddedJpeg = { offset: number; length: number; width: number; height: number };

/** JPEG 하나를 SOI부터 따라가 끝 위치와 크기를 구한다. 구조가 깨졌으면 null */
function readJpeg(bytes: Uint8Array, start: number): EmbeddedJpeg | null {
  let width = 0;
  let height = 0;
  let i = start + 2;
  const end = bytes.length;
  // 끝 표시(FFD9)는 2바이트라 파일 맨 끝에 있어도 읽을 수 있어야 한다
  while (i + 2 <= end) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd9) return width && height ? { offset: start, length: i + 2 - start, width, height } : null;
    // 길이 없는 마커 (RST · TEM)
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (i + 4 > end) return null;
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (length < 2 || i + 2 + length > end) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = (bytes[i + 5]! << 8) | bytes[i + 6]!;
      width = (bytes[i + 7]! << 8) | bytes[i + 8]!;
    }
    i += 2 + length;
    if (marker === 0xda) {
      // 압축 데이터: 다음 마커(FF 뒤가 00 · RST가 아닌 것)까지 건너뛴다
      while (i + 1 < end) {
        if (bytes[i] === 0xff) {
          const next = bytes[i + 1]!;
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        }
        i++;
      }
    }
  }
  return null;
}

/** 파일 안의 미리보기 JPEG 중 가장 큰 것 (없으면 null) */
export function findLargestEmbeddedJpeg(buffer: ArrayBuffer): EmbeddedJpeg | null {
  const bytes = new Uint8Array(buffer);
  let best: EmbeddedJpeg | null = null;
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    const jpeg = readJpeg(bytes, i);
    if (!jpeg) continue;
    if (!best || jpeg.width * jpeg.height > best.width * best.height) best = jpeg;
    // 찾은 JPEG 안쪽(썸네일 속 썸네일)은 다시 보지 않는다
    i += jpeg.length - 1;
  }
  return best;
}

/** EXIF 방향(1~8)을 반영해 그린다. 미리보기 JPEG에는 방향 정보가 없는 경우가 많아 RAW의 값을 쓴다. */
export function orientedSize(width: number, height: number, orientation: number): { width: number; height: number } {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}
