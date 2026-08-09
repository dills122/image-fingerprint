import { readFileSync } from 'node:fs';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { fingerprintPixels } from '../src/core';
import {
  decodeImage,
  fingerprintImage,
  pixelsFromImageData,
} from '../src/browser';

const createImageData = (
  width: number,
  height: number,
  data = new Uint8ClampedArray(width * height * 4),
): ImageData => ({ width, height, data } as ImageData);

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

const installBrowserDecodeMocks = (
  width: number,
  height: number,
): { readonly close: ReturnType<typeof vi.fn> } => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
    width,
    height,
    close,
  }));

  class FakeOffscreenCanvas {
    public width: number;
    public height: number;

    public constructor(canvasWidth: number, canvasHeight: number) {
      this.width = canvasWidth;
      this.height = canvasHeight;
    }

    public getContext(): {
      drawImage: ReturnType<typeof vi.fn>;
      getImageData: () => ImageData;
    } {
      return {
        drawImage: vi.fn(),
        getImageData: () => createImageData(this.width, this.height),
      };
    }
  }

  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  return { close };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser image adapter', () => {
  it('wraps ImageData as zero-copy portable RGBA8 pixels', () => {
    const imageData = createImageData(5, 5);
    const pixels = pixelsFromImageData(imageData);

    expect(pixels).toEqual({
      format: 'rgba8',
      width: 5,
      height: 5,
      data: imageData.data,
    });
    expect(pixels.data).toBe(imageData.data);
  });

  it('accepts ImageData through the shared asynchronous decoder shape', async () => {
    const imageData = createImageData(5, 5);

    await expect(decodeImage(imageData)).resolves.toEqual({
      format: 'rgba8',
      width: 5,
      height: 5,
      data: imageData.data,
    });
  });

  it('composes ImageData preparation with the exact public pixel fingerprinter', async () => {
    const data = new Uint8ClampedArray(5 * 5 * 4);
    for (let index = 0; index < data.length; index += 4) {
      data[index] = index % 256;
      data[index + 1] = (index * 3) % 256;
      data[index + 2] = (index * 7) % 256;
      data[index + 3] = 255;
    }
    const imageData = createImageData(5, 5, data);

    await expect(fingerprintImage(imageData, {
      algorithm: 'pdq-v1',
    })).resolves.toEqual(fingerprintPixels(
      pixelsFromImageData(imageData),
      { algorithm: 'pdq-v1' },
    ));
  });

  it('decodes static Blobs with native browser APIs and closes temporary bitmaps', async () => {
    const encoded = readFileSync('example/Example.png');
    const { width, height } = await import('../src/adapters/inspect-encoded-image')
      .then(({ inspectEncodedImage }) => inspectEncodedImage(encoded));
    const { close } = installBrowserDecodeMocks(width, height);

    const pixels = await decodeImage(new Blob([encoded], { type: 'image/png' }));

    expect(pixels).toEqual({
      format: 'rgba8',
      width,
      height,
      data: expect.any(Uint8ClampedArray),
    });
    expect(close).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledWith(
      expect.any(Blob),
      {
        colorSpaceConversion: 'default',
        imageOrientation: 'from-image',
        premultiplyAlpha: 'none',
      },
    );
  });

  it('enforces the same byte and pixel limit categories for browser sources', async () => {
    const encoded = readFileSync('example/Example.png');

    await expect(decodeImage(new Blob([encoded]), {
      limits: { maxEncodedBytes: 10 },
    })).rejects.toMatchObject({ code: 'limit-exceeded' });

    await expect(decodeImage(createImageData(6, 5), {
      limits: { maxPixels: 25 },
    })).rejects.toMatchObject({ code: 'limit-exceeded' });
  });

  it('rejects encoded decoding when browser bitmap APIs are unavailable', async () => {
    const encoded = readFileSync('example/Example.png');

    await expect(decodeImage(new Blob([encoded])))
      .rejects.toMatchObject({ code: 'unsupported-runtime' });
  });

  it('rejects animated images before invoking native frame selection', async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createBitmap);

    await expect(decodeImage(new Blob([createAnimatedWebpHeader()])))
      .rejects.toMatchObject({ code: 'animated-image' });
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('rejects malformed ImageData at the portable boundary', () => {
    expect(() => pixelsFromImageData(createImageData(
      5,
      5,
      new Uint8ClampedArray(99),
    ))).toThrow(expect.objectContaining({ code: 'invalid-input' }));
  });
});
