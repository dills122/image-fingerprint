import { readFileSync } from 'node:fs';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { inspectEncodedImage } from '../src/adapters/inspect-encoded-image';
import { ImagePreparationError } from '../src/core';

const createAnimatedPngHeader = (): Uint8Array => Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13,
  0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 5,
  0, 0, 0, 6,
  8, 6, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 8,
  0x61, 0x63, 0x54, 0x4c,
  0, 0, 0, 2,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0x49, 0x45, 0x4e, 0x44,
  0, 0, 0, 0,
]);

const createAnimatedWebpHeader = (): Uint8Array => Uint8Array.from([
  0x52, 0x49, 0x46, 0x46,
  22, 0, 0, 0,
  0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x58,
  10, 0, 0, 0,
  0x02, 0, 0, 0,
  4, 0, 0,
  5, 0, 0,
]);

describe('inspectEncodedImage', () => {
  it.each([
    ['jpeg', 'example/_95695590_tv039055678.jpg'],
    ['png', 'example/Example.png'],
    ['webp', 'example/Example.webp'],
  ] as const)('reads static %s dimensions without decoding pixels', (format, path) => {
    const result = inspectEncodedImage(readFileSync(path));

    expect(result.format).toBe(format);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.animated).toBe(false);
  });

  it('recognizes APNG animation control chunks', () => {
    expect(inspectEncodedImage(createAnimatedPngHeader())).toEqual({
      format: 'png',
      width: 5,
      height: 6,
      animated: true,
    });
  });

  it('recognizes the WebP extended-header animation flag', () => {
    expect(inspectEncodedImage(createAnimatedWebpHeader())).toEqual({
      format: 'webp',
      width: 5,
      height: 6,
      animated: true,
    });
  });

  it('separates unsupported formats from malformed supported images', () => {
    expect(() => inspectEncodedImage(Uint8Array.from([0x47, 0x49, 0x46])))
      .toThrow(expect.objectContaining<ImagePreparationError>({
        code: 'unsupported-format',
      }));

    expect(() => inspectEncodedImage(Uint8Array.from([0xff, 0xd8, 0xff])))
      .toThrow(expect.objectContaining<ImagePreparationError>({
        code: 'decode-failed',
      }));

    expect(() => inspectEncodedImage(createAnimatedPngHeader().slice(0, -12)))
      .toThrow(expect.objectContaining<ImagePreparationError>({
        code: 'decode-failed',
      }));
  });
});
