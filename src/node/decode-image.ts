import { open } from 'node:fs/promises';
import {
  ImagePreparationError,
} from '../core/image-decoder';
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
  AbortSignalLike,
  DecodeImageFunction,
  ImageDecoder,
} from '../core/image-decoder';

export type NodeImageSource = string | URL | Uint8Array;

const UINT8_ARRAY_TAG = '[object Uint8Array]';

const loadSharp = async (): Promise<typeof import('sharp')> => {
  const module: unknown = await import('sharp');
  if (typeof module !== 'object' || module === null) {
    throw new TypeError('Sharp module did not expose an object namespace');
  }
  const candidate: unknown = Reflect.get(module, 'default');
  if (typeof candidate !== 'function') {
    throw new TypeError('Sharp module did not expose its default factory');
  }
  return candidate as typeof import('sharp');
};

const isUint8Array = (value: unknown): value is Uint8Array => (
  ArrayBuffer.isView(value)
  && Object.prototype.toString.call(value) === UINT8_ARRAY_TAG
);

const readEncodedSource = async (
  source: NodeImageSource,
  maxEncodedBytes: number,
  signal?: AbortSignalLike,
): Promise<Uint8Array> => {
  if (isUint8Array(source)) {
    assertEncodedByteLimit(source.byteLength, {
      maxEncodedBytes,
      maxPixels: Number.MAX_SAFE_INTEGER,
    });
    return source;
  }

  if (typeof source !== 'string' && !(source instanceof URL)) {
    throw new ImagePreparationError(
      'invalid-input',
      'Node image source must be a path, file URL, or Uint8Array',
    );
  }
  if (typeof source === 'string' && source.length === 0) {
    throw new ImagePreparationError('invalid-input', 'Image path must not be empty');
  }
  if (source instanceof URL && source.protocol !== 'file:') {
    throw new ImagePreparationError(
      'invalid-input',
      'Node image URL must use the file: protocol',
    );
  }

  try {
    const file = await open(source, 'r');
    try {
      throwIfAborted(signal);
      const fileStats = await raceWithAbort(file.stat(), signal);
      assertEncodedByteLimit(fileStats.size, {
        maxEncodedBytes,
        maxPixels: Number.MAX_SAFE_INTEGER,
      });
      const data = await raceWithAbort(file.readFile(), signal);
      assertEncodedByteLimit(data.byteLength, {
        maxEncodedBytes,
        maxPixels: Number.MAX_SAFE_INTEGER,
      });
      return data;
    } finally {
      await file.close();
    }
  } catch (error) {
    throw translatePreparationError(
      error,
      'input-read-failed',
      'Could not read the encoded image source',
    );
  }
};

const decodeNodeImage: DecodeImageFunction<NodeImageSource> = async (
  source,
  options,
) => {
  const limits = resolveDecodeLimits(options);
  throwIfAborted(options?.signal);
  const encoded = await readEncodedSource(
    source,
    limits.maxEncodedBytes,
    options?.signal,
  );
  const metadata = inspectEncodedImage(encoded);
  assertPixelLimit(metadata.width, metadata.height, limits);
  if (metadata.animated) {
    throw new ImagePreparationError(
      'animated-image',
      'Animated images are not supported',
    );
  }

  let sharp: typeof import('sharp');
  try {
    sharp = await loadSharp();
  } catch (error) {
    throw new ImagePreparationError(
      'unsupported-runtime',
      'The Sharp image decoder is unavailable in this Node.js runtime',
      { cause: error },
    );
  }

  throwIfAborted(options?.signal);
  const pipeline = sharp(encoded, {
    failOn: 'warning',
    limitInputPixels: limits.maxPixels,
    pages: 1,
  })
    .autoOrient()
    .toColourspace('srgb')
    .ensureAlpha()
    .raw();

  try {
    const { data, info } = await raceWithAbort(
      pipeline.toBuffer({ resolveWithObject: true }),
      options?.signal,
      () => pipeline.destroy(),
    );
    throwIfAborted(options?.signal);
    assertPixelLimit(info.width, info.height, limits);

    if (info.channels !== 4 || info.premultiplied === true) {
      throw new ImagePreparationError(
        'decode-failed',
        'Sharp did not return straight-alpha RGBA8 pixels',
      );
    }

    const pixels = {
      format: 'rgba8',
      width: info.width,
      height: info.height,
      data,
    } as const;
    try {
      validatePixelSource(pixels);
    } catch (error) {
      throw new ImagePreparationError(
        'decode-failed',
        'Sharp returned an invalid pixel buffer',
        { cause: error },
      );
    }
    return pixels;
  } catch (error) {
    throw translatePreparationError(
      error,
      'decode-failed',
      'Sharp could not decode the image',
    );
  }
};

const nodeImageDecoder = {
  decodeImage: decodeNodeImage,
  fingerprintImage: createFingerprintImage(decodeNodeImage),
} satisfies ImageDecoder<NodeImageSource>;

export const { decodeImage, fingerprintImage } = nodeImageDecoder;
