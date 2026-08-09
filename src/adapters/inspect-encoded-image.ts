import { ImagePreparationError } from '../core/image-decoder';

export type EncodedImageFormat = 'jpeg' | 'png' | 'webp';

export interface EncodedImageMetadata {
  readonly format: EncodedImageFormat;
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
}

const failDecode = (message: string): never => {
  throw new ImagePreparationError('decode-failed', message);
};

const matchesBytes = (
  data: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean => expected.every((value, index) => data[offset + index] === value);

const readUint16BE = (data: Uint8Array, offset: number): number => (
  data[offset] * 0x100 + data[offset + 1]
);

const readUint16LE = (data: Uint8Array, offset: number): number => (
  data[offset] + data[offset + 1] * 0x100
);

const readUint24LE = (data: Uint8Array, offset: number): number => (
  data[offset]
  + data[offset + 1] * 0x100
  + data[offset + 2] * 0x10000
);

const readUint32BE = (data: Uint8Array, offset: number): number => (
  data[offset] * 0x1000000
  + data[offset + 1] * 0x10000
  + data[offset + 2] * 0x100
  + data[offset + 3]
);

const readUint32LE = (data: Uint8Array, offset: number): number => (
  data[offset]
  + data[offset + 1] * 0x100
  + data[offset + 2] * 0x10000
  + data[offset + 3] * 0x1000000
);

const chunkName = (data: Uint8Array, offset: number): string => String.fromCharCode(
  data[offset],
  data[offset + 1],
  data[offset + 2],
  data[offset + 3],
);

const validateDimensions = (width: number, height: number): void => {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
  ) {
    failDecode('Encoded image declares invalid dimensions');
  }
};

const inspectPng = (data: Uint8Array): EncodedImageMetadata => {
  if (
    data.length < 33
    || readUint32BE(data, 8) !== 13
    || chunkName(data, 12) !== 'IHDR'
  ) {
    return failDecode('PNG header is truncated or malformed');
  }

  const width = readUint32BE(data, 16);
  const height = readUint32BE(data, 20);
  validateDimensions(width, height);

  let animated = false;
  let complete = false;
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = readUint32BE(data, offset);
    const name = chunkName(data, offset + 4);
    const nextOffset = offset + 12 + length;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > data.length) {
      return failDecode('PNG chunk is truncated or malformed');
    }
    if (name === 'acTL') animated = true;
    offset = nextOffset;
    if (name === 'IEND') {
      complete = true;
      break;
    }
  }

  if (!complete) return failDecode('PNG end chunk was not found');

  return { format: 'png', width, height, animated };
};

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

const inspectJpeg = (data: Uint8Array): EncodedImageMetadata => {
  let offset = 2;
  while (offset < data.length) {
    while (data[offset] === 0xff) offset += 1;
    if (offset >= data.length) break;
    const marker = data[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) {
      return failDecode('JPEG segment is truncated or malformed');
    }

    const segmentLength = readUint16BE(data, offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) {
      return failDecode('JPEG segment is truncated or malformed');
    }
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return failDecode('JPEG frame header is malformed');
      const height = readUint16BE(data, offset + 3);
      const width = readUint16BE(data, offset + 5);
      validateDimensions(width, height);
      return { format: 'jpeg', width, height, animated: false };
    }
    offset += segmentLength;
  }

  return failDecode('JPEG dimensions were not found');
};

const inspectWebp = (data: Uint8Array): EncodedImageMetadata => {
  const declaredEnd = readUint32LE(data, 4) + 8;
  if (!Number.isSafeInteger(declaredEnd) || declaredEnd > data.length) {
    return failDecode('WebP RIFF container is truncated or malformed');
  }
  let width: number | undefined;
  let height: number | undefined;
  let animated = false;
  let offset = 12;

  while (offset + 8 <= data.length) {
    const name = chunkName(data, offset);
    const length = readUint32LE(data, offset + 4);
    const payloadOffset = offset + 8;
    const payloadEnd = payloadOffset + length;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > data.length) {
      return failDecode('WebP chunk is truncated or malformed');
    }

    if (name === 'VP8X') {
      if (length < 10) return failDecode('WebP VP8X header is malformed');
      animated ||= (data[payloadOffset] & 0x02) !== 0;
      width = readUint24LE(data, payloadOffset + 4) + 1;
      height = readUint24LE(data, payloadOffset + 7) + 1;
    } else if (name === 'VP8 ') {
      if (
        length < 10
        || !matchesBytes(data, payloadOffset + 3, [0x9d, 0x01, 0x2a])
      ) {
        return failDecode('WebP VP8 frame header is malformed');
      }
      width = readUint16LE(data, payloadOffset + 6) & 0x3fff;
      height = readUint16LE(data, payloadOffset + 8) & 0x3fff;
    } else if (name === 'VP8L') {
      if (length < 5 || data[payloadOffset] !== 0x2f) {
        return failDecode('WebP VP8L frame header is malformed');
      }
      const bits = readUint32LE(data, payloadOffset + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (name === 'ANIM' || name === 'ANMF') {
      animated = true;
    }

    offset = payloadEnd + (length % 2);
  }

  if (width === undefined || height === undefined) {
    return failDecode('WebP dimensions were not found');
  }
  validateDimensions(width, height);
  return { format: 'webp', width, height, animated };
};

export const inspectEncodedImage = (
  data: Uint8Array,
): EncodedImageMetadata => {
  if (matchesBytes(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return inspectPng(data);
  }
  if (matchesBytes(data, 0, [0xff, 0xd8])) {
    return inspectJpeg(data);
  }
  if (
    matchesBytes(data, 0, [0x52, 0x49, 0x46, 0x46])
    && matchesBytes(data, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return inspectWebp(data);
  }
  throw new ImagePreparationError(
    'unsupported-format',
    'Only static JPEG, PNG, and WebP images are supported',
  );
};
