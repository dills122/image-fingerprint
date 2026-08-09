import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import webp from '@cwasm/webp';
import type { EncodedImageFormat } from '../adapters/inspect-encoded-image';
import type { RgbaImageData } from '../core/types';

const asBuffer = (data: Uint8Array): Buffer => Buffer.from(
  data.buffer,
  data.byteOffset,
  data.byteLength,
);

/** Decode bytes exactly as image-hash@7.x did, without orientation or ICC normalization. */
export const decodeImageHashV7 = (
  data: Uint8Array,
  format: EncodedImageFormat,
): RgbaImageData => {
  const encoded = asBuffer(data);
  if (format === 'png') {
    return PNG.sync.read(encoded);
  }
  if (format === 'jpeg') {
    return jpeg.decode(encoded);
  }
  return webp.decode(encoded);
};
