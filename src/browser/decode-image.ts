import { ImagePreparationError } from '../core/image-decoder';
import { validatePixelSource } from '../core/pixels';
import {
  assertEncodedByteLimit,
  assertPixelLimit,
  createFingerprintImage,
  raceWithAbort,
  resolveDecodeLimits,
  throwIfAborted,
  translatePreparationError,
} from '../adapters/contract';
import { inspectEncodedImage } from '../adapters/inspect-encoded-image';
import type {
  DecodeImageFunction,
  ImageDecoder,
} from '../core/image-decoder';
import type { Rgba8PixelSource } from '../core/types';

export type BrowserImageSource = Blob | ImageData;

const UINT8_CLAMPED_ARRAY_TAG = '[object Uint8ClampedArray]';

const isImageDataLike = (value: unknown): value is ImageData => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    readonly width?: unknown;
    readonly height?: unknown;
    readonly data?: unknown;
  };
  return (
    typeof candidate.width === 'number'
    && typeof candidate.height === 'number'
    && ArrayBuffer.isView(candidate.data)
    && Object.prototype.toString.call(candidate.data) === UINT8_CLAMPED_ARRAY_TAG
  );
};

const isBlobLike = (value: unknown): value is Blob => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    readonly size?: unknown;
    readonly arrayBuffer?: unknown;
  };
  return (
    typeof candidate.size === 'number'
    && Number.isSafeInteger(candidate.size)
    && candidate.size >= 0
    && typeof candidate.arrayBuffer === 'function'
  );
};

export const pixelsFromImageData = (
  imageData: ImageData,
): Rgba8PixelSource => {
  if (!isImageDataLike(imageData)) {
    throw new ImagePreparationError(
      'invalid-input',
      'Expected an ImageData object with Uint8ClampedArray pixels',
    );
  }

  const pixels = {
    format: 'rgba8',
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  } as const;
  try {
    validatePixelSource(pixels);
  } catch (error) {
    throw new ImagePreparationError(
      'invalid-input',
      'ImageData does not satisfy the portable pixel contract',
      { cause: error },
    );
  }
  return pixels;
};

interface PixelCanvas {
  readonly draw: (bitmap: ImageBitmap) => void;
  readonly read: () => ImageData;
  readonly release: () => void;
}

const createPixelCanvas = (width: number, height: number): PixelCanvas => {
  const settings = {
    alpha: true,
    colorSpace: 'srgb',
    willReadFrequently: true,
  } as const;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', settings);
    if (context === null) {
      throw new ImagePreparationError(
        'unsupported-runtime',
        'An OffscreenCanvas 2D context is unavailable',
      );
    }
    return {
      draw: (bitmap) => context.drawImage(bitmap, 0, 0),
      read: () => context.getImageData(0, 0, width, height),
      release: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext(
      '2d',
      settings,
    ) as CanvasRenderingContext2D | null;
    if (context === null) {
      throw new ImagePreparationError(
        'unsupported-runtime',
        'A Canvas 2D context is unavailable',
      );
    }
    return {
      draw: (bitmap) => context.drawImage(bitmap, 0, 0),
      read: () => context.getImageData(0, 0, width, height),
      release: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  }

  throw new ImagePreparationError(
    'unsupported-runtime',
    'Encoded browser images require OffscreenCanvas or a document canvas',
  );
};

const decodeBrowserImage: DecodeImageFunction<BrowserImageSource> = async (
  source,
  options,
) => {
  const limits = resolveDecodeLimits(options);
  throwIfAborted(options?.signal);

  if (isImageDataLike(source)) {
    assertPixelLimit(source.width, source.height, limits);
    return pixelsFromImageData(source);
  }
  if (!isBlobLike(source)) {
    throw new ImagePreparationError(
      'invalid-input',
      'Browser image source must be a Blob, File, or ImageData object',
    );
  }

  assertEncodedByteLimit(source.size, limits);
  let encoded: Uint8Array;
  try {
    const arrayBuffer = await raceWithAbort(source.arrayBuffer(), options?.signal);
    encoded = new Uint8Array(arrayBuffer);
  } catch (error) {
    throw translatePreparationError(
      error,
      'input-read-failed',
      'Could not read the browser image source',
    );
  }
  assertEncodedByteLimit(encoded.byteLength, limits);

  const metadata = inspectEncodedImage(encoded);
  assertPixelLimit(metadata.width, metadata.height, limits);
  if (metadata.animated) {
    throw new ImagePreparationError(
      'animated-image',
      'Animated images are not supported',
    );
  }
  if (typeof createImageBitmap !== 'function') {
    throw new ImagePreparationError(
      'unsupported-runtime',
      'createImageBitmap is unavailable in this browser runtime',
    );
  }

  let bitmap: ImageBitmap | undefined;
  let canvas: PixelCanvas | undefined;
  try {
    const bitmapOperation = createImageBitmap(source, {
      colorSpaceConversion: 'default',
      imageOrientation: 'from-image',
      premultiplyAlpha: 'none',
    }).then((result) => {
      if (options?.signal?.aborted === true) {
        result.close();
        throw new ImagePreparationError(
          'aborted',
          'Image preparation was aborted',
          options.signal.reason === undefined
            ? undefined
            : { cause: options.signal.reason },
        );
      }
      return result;
    });
    bitmap = await raceWithAbort(bitmapOperation, options?.signal);
    assertPixelLimit(bitmap.width, bitmap.height, limits);
    throwIfAborted(options?.signal);

    canvas = createPixelCanvas(bitmap.width, bitmap.height);
    canvas.draw(bitmap);
    throwIfAborted(options?.signal);
    return pixelsFromImageData(canvas.read());
  } catch (error) {
    throw translatePreparationError(
      error,
      'decode-failed',
      'The browser could not decode the image',
    );
  } finally {
    canvas?.release();
    bitmap?.close();
  }
};

const browserImageDecoder = {
  decodeImage: decodeBrowserImage,
  fingerprintImage: createFingerprintImage(decodeBrowserImage),
} satisfies ImageDecoder<BrowserImageSource>;

export const { decodeImage, fingerprintImage } = browserImageDecoder;
