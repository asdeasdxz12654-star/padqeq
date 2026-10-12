// 업로드된 변환본을 서버에서 다시 확인한다 (확장자 · Content-Type은 믿지 않는다).
//  · AVIF: ftyp 브랜드와 ispe(이미지 크기) 상자를 읽는다
//  · JPEG: SOF 마커에서 크기를 읽고, EXIF(APP1) · XMP가 남아 있으면 거부한다 (GPS 잔존 방지)

export type Inspection =
  | { ok: true; format: "avif" | "jpeg"; width: number; height: number }
  | { ok: false; reason: string };

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

export function inspectImage(buffer: ArrayBuffer): Inspection {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") return inspectAvif(bytes);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes);
  return { ok: false, reason: "지원하지 않는 형식" };
}

function inspectAvif(bytes: Uint8Array): Inspection {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ftypSize = view.getUint32(0);
  if (ftypSize < 16 || ftypSize > bytes.length) return { ok: false, reason: "AVIF 헤더 손상" };
  const brands = [ascii(bytes, 8, 4)];
  for (let i = 16; i + 4 <= ftypSize; i += 4) brands.push(ascii(bytes, i, 4));
  if (!brands.includes("avif")) return { ok: false, reason: "AVIF가 아님" };

  // meta 상자 안의 ispe를 찾는다. 상자 구조를 따라가며 필요한 곳만 연다.
  let found: { width: number; height: number } | null = null;
  const walk = (start: number, end: number, depth: number) => {
    let offset = start;
    while (offset + 8 <= end && !found && depth < 6) {
      let size = view.getUint32(offset);
      const type = ascii(bytes, offset + 4, 4);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) return;
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) return;
      const body = offset + header;
      if (type === "meta") walk(body + 4, offset + size, depth + 1); // full box: version/flags 4바이트
      else if (type === "iprp" || type === "ipco") walk(body, offset + size, depth + 1);
      else if (type === "ispe" && size >= header + 12) {
        found = { width: view.getUint32(body + 4), height: view.getUint32(body + 8) };
      }
      offset += size;
    }
  };
  walk(0, bytes.length, 0);
  const size = found as { width: number; height: number } | null;
  if (!size || size.width === 0 || size.height === 0) return { ok: false, reason: "AVIF 크기 정보 없음" };
  return { ok: true, format: "avif", ...size };
}

function inspectJpeg(bytes: Uint8Array): Inspection {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return { ok: false, reason: "JPEG 구조 손상" };
    const marker = bytes[offset + 1]!;
    // 채움 바이트
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) return { ok: false, reason: "JPEG 구조 손상" };

    if (marker === 0xe1) {
      const id = ascii(bytes, offset + 4, Math.min(28, length - 2));
      if (id.startsWith("Exif") || id.startsWith("http://ns.adobe.com/xap")) {
        return { ok: false, reason: "메타데이터(EXIF · XMP)가 남아 있음" };
      }
    }
    // SOF0~SOF15 (DHT C4 · JPG C8 · DAC CC 제외)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      if (width === 0 || height === 0) return { ok: false, reason: "JPEG 크기 정보 없음" };
      return { ok: true, format: "jpeg", width, height };
    }
    // 영상 데이터 시작 전에 크기를 찾아야 한다
    if (marker === 0xda) break;
    offset += 2 + length;
  }
  return { ok: false, reason: "JPEG 크기 정보 없음" };
}
