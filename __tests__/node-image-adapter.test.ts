import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  describe,
  expect,
  it,
} from 'vitest';
import sharp from 'sharp';
import { fingerprintPixels } from '../src/core';
import {
  decodeImage,
  fingerprintImage,
} from '../src/node';
import { ImagePreparationError } from '../src/core';

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

describe('Node image adapter', () => {
  it.each([
    'example/_95695590_tv039055678.jpg',
    'example/Example.png',
    'example/Example.webp',
  ])('decodes static %s as tightly packed straight-alpha RGBA8', async (path) => {
    const pixels = await decodeImage(path);

    expect(pixels.format).toBe('rgba8');
    expect(pixels.width).toBeGreaterThanOrEqual(5);
    expect(pixels.height).toBeGreaterThanOrEqual(5);
    expect(pixels.data).toBeInstanceOf(Uint8Array);
    expect(pixels.data).toHaveLength(pixels.width * pixels.height * 4);
  });

  it('accepts file URLs, Uint8Array views, and Buffer instances', async () => {
    const path = resolve('example/_95695590_tv039055678.jpg');
    const encoded = readFileSync(path);
    const view = new Uint8Array(
      encoded.buffer,
      encoded.byteOffset,
      encoded.byteLength,
    );

    const fromUrl = await decodeImage(pathToFileURL(path));
    const fromView = await decodeImage(view);
    const fromBuffer = await decodeImage(encoded);

    expect({
      format: fromView.format,
      width: fromView.width,
      height: fromView.height,
    }).toEqual({
      format: fromUrl.format,
      width: fromUrl.width,
      height: fromUrl.height,
    });
    expect({
      format: fromBuffer.format,
      width: fromBuffer.width,
      height: fromBuffer.height,
    }).toEqual({
      format: fromUrl.format,
      width: fromUrl.width,
      height: fromUrl.height,
    });
    expect(Buffer.compare(fromView.data, fromUrl.data)).toBe(0);
    expect(Buffer.compare(fromBuffer.data, fromUrl.data)).toBe(0);
  }, 15_000);

  it('composes decoding with the exact public pixel fingerprinter', async () => {
    const path = 'example/_95695590_tv039055678.jpg';
    const pixels = await decodeImage(path);

    await expect(fingerprintImage(path, {
      algorithm: 'pdq-v1',
    })).resolves.toEqual(fingerprintPixels(pixels, {
      algorithm: 'pdq-v1',
    }));
  });

  it('fingerprints normalized encoded images with blockhash-v1', async () => {
    const path = 'example/_95695590_tv039055678.jpg';
    const pixels = await decodeImage(path);
    const options = {
      algorithm: 'blockhash-v1',
      bitsPerSide: 16,
      method: 2,
    } as const;

    await expect(fingerprintImage(path, options)).resolves.toEqual(
      fingerprintPixels(pixels, options),
    );
  });

  it.each([
    {
      path: 'example/_95695590_tv039055678.jpg',
      expected: '0773063f063f36070e070a070f378e7f1f000fff0fff020103f00ffb0f810ff0',
    },
    {
      path: 'benchmarks/pdq/fixtures/images/orientation-6-srgb.jpg',
      expected: '000057f676bc2f6e0df85fd60eb023380ff24fe217c40d94697a7fde56f40000',
    },
    {
      path: 'benchmarks/pdq/fixtures/images/opaque-p3.png',
      expected: '000057f27ebc2f6e0df85fd60eb021b807f24fe237cc0d14697a7fce57f40000',
    },
    {
      path: 'benchmarks/pdq/fixtures/images/alpha-srgb.webp',
      expected: '70ead73a31468d51a8c58e3172af562a518e9c70e156aa75eb9d1aa9438e5462',
    },
  ])('reproduces the historical hash for $path in image-hash-v7 mode', async ({
    path,
    expected,
  }) => {
    const options = {
      algorithm: 'blockhash-v1',
      bitsPerSide: 16,
      method: 2,
      decoderMode: 'image-hash-v7',
    } as const;

    const result = await fingerprintImage(path, options);

    expect(result.hash).toBe(expected);
  });

  it('keeps normalized and historical decoder policies observably distinct', async () => {
    const path = 'benchmarks/pdq/fixtures/images/orientation-6-srgb.jpg';
    const options = {
      algorithm: 'blockhash-v1',
      bitsPerSide: 16,
      method: 2,
    } as const;

    const normalized = await fingerprintImage(path, options);
    const historical = await fingerprintImage(path, {
      ...options,
      decoderMode: 'image-hash-v7',
    });

    expect(normalized.hash).toBe(
      '000077b635dc6fe63a780f7847e00fb847f617b003d449f435fc6dee377a0000',
    );
    expect(historical.hash).toBe(
      '000057f676bc2f6e0df85fd60eb023380ff24fe217c40d94697a7fde56f40000',
    );
  });

  it('rejects image-hash-v7 decoder mode for PDQ', async () => {
    await expect(fingerprintImage('example/Example.png', {
      algorithm: 'pdq-v1',
      decoderMode: 'image-hash-v7',
    })).rejects.toMatchObject({
      name: 'ImagePreparationError',
      code: 'invalid-input',
    });
  });

  it('rejects unknown decoder modes instead of falling back to normalization', async () => {
    await expect(fingerprintImage('example/Example.png', {
      algorithm: 'blockhash-v1',
      bitsPerSide: 16,
      method: 2,
      decoderMode: 'image-hash-v8',
    } as unknown as Parameters<typeof fingerprintImage>[1])).rejects.toMatchObject({
      name: 'ImagePreparationError',
      code: 'invalid-input',
    });
  });

  it('applies EXIF orientation before exposing region coordinates', async () => {
    const encoded = await sharp({
      create: {
        width: 5,
        height: 7,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const pixels = await decodeImage(encoded);

    expect({ width: pixels.width, height: pixels.height }).toEqual({
      width: 7,
      height: 5,
    });
  });

  it('returns lossless PNG pixels with straight rather than premultiplied alpha', async () => {
    const source = new Uint8Array(5 * 5 * 4);
    for (let index = 0; index < source.length; index += 4) {
      source.set([200, 10, 20, 128], index);
    }
    const encoded = await sharp(source, {
      raw: { width: 5, height: 5, channels: 4 },
    }).png().toBuffer();

    const pixels = await decodeImage(encoded);

    expect(Array.from(pixels.data.slice(0, 4))).toEqual([200, 10, 20, 128]);
  });

  it('enforces encoded byte and decoded pixel limits before hashing', async () => {
    const path = 'example/_95695590_tv039055678.jpg';

    await expect(decodeImage(path, {
      limits: { maxEncodedBytes: 10 },
    })).rejects.toMatchObject({ code: 'limit-exceeded' });

    await expect(decodeImage(path, {
      limits: { maxPixels: 25 },
    })).rejects.toMatchObject({ code: 'limit-exceeded' });
  });

  it('preserves source-read failures as a stable category', async () => {
    await expect(decodeImage('example/missing-image.jpg'))
      .rejects.toMatchObject({
        name: 'ImagePreparationError',
        code: 'input-read-failed',
        cause: expect.any(Error),
      });
  });

  it('rejects unsupported URL protocols and encoded formats explicitly', async () => {
    await expect(decodeImage(new URL('https://example.test/image.jpg')))
      .rejects.toMatchObject({ code: 'invalid-input' });

    await expect(decodeImage(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39])))
      .rejects.toMatchObject({ code: 'unsupported-format' });
  });

  it('rejects animated input before Sharp can choose an implicit frame', async () => {
    await expect(decodeImage(createAnimatedWebpHeader()))
      .rejects.toMatchObject({ code: 'animated-image' });
  });

  it('rejects an already-aborted operation before reading', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(decodeImage('example/_95695590_tv039055678.jpg', {
      signal: controller.signal,
    })).rejects.toMatchObject<ImagePreparationError>({
      code: 'aborted',
      cause: controller.signal.reason,
    });
  });
});
