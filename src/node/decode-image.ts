import { open } from 'node:fs/promises';
import {
  ImagePreparationError,
} from '../core/image-decoder';
import { validatePixelSource } from '../core/pixels';
import {
  assertEncodedByteLimit,
  assertPixelLimit,
  raceWithAbort,
  resolveDecodeLimits,
  throwIfAborted,
  translatePreparationError,
} from '../adapters/contract';
import { inspectEncodedImage } from '../adapters/inspect-encoded-image';
import { fingerprintPixels } from '../core/fingerprint';
import { decodeImageHashV7 } from './image-hash-v7-decoder';
import type {
  AbortSignalLike,
  DecodeImageFunction,
  DecodeImageOptions,
} from '../core/image-decoder';
import type {
  BlockHashFingerprint,
  BlockHashFingerprintOptions,
  ImageFingerprint,
  PdqFingerprint,
  PdqFingerprintOptions,
} from '../core/types';

export type NodeImageSource = string | URL | Uint8Array;
export type NodeImageDecoderMode = 'normalized' | 'image-hash-v7';

export type NodeFingerprintImageOptions = DecodeImageOptions & (
  | (PdqFingerprintOptions & {
    readonly decoderMode?: 'normalized';
  })
  | (BlockHashFingerprintOptions & {
    readonly decoderMode?: NodeImageDecoderMode;
  })
);

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

const prepareEncodedSource = async (
  source: NodeImageSource,
  options?: DecodeImageOptions,
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
  return { encoded, limits, metadata };
};

const decodeNodeImage: DecodeImageFunction<NodeImageSource> = async (
  source,
  options,
) => {
  const { encoded, limits } = await prepareEncodedSource(source, options);

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

const fingerprintNodeImage = async (
  source: NodeImageSource,
  options: NodeFingerprintImageOptions,
): Promise<ImageFingerprint> => {
  if (
    options.decoderMode !== undefined
    && options.decoderMode !== 'normalized'
    && options.decoderMode !== 'image-hash-v7'
  ) {
    throw new ImagePreparationError(
      'invalid-input',
      'decoderMode must be normalized or image-hash-v7',
    );
  }
  if (options.decoderMode !== 'image-hash-v7') {
    const pixels = await decodeNodeImage(source, options);
    throwIfAborted(options.signal);
    if (options.algorithm === 'blockhash-v1') {
      return fingerprintPixels(pixels, {
        algorithm: options.algorithm,
        bitsPerSide: options.bitsPerSide,
        method: options.method,
      });
    }
    return fingerprintPixels(pixels, { algorithm: options.algorithm });
  }
  if (options.algorithm !== 'blockhash-v1') {
    throw new ImagePreparationError(
      'invalid-input',
      'image-hash-v7 decoder mode is only supported with blockhash-v1',
    );
  }

  const { encoded, metadata } = await prepareEncodedSource(source, options);
  let pixels;
  try {
    pixels = decodeImageHashV7(encoded, metadata.format);
  } catch (error) {
    throw translatePreparationError(
      error,
      'decode-failed',
      'The image-hash-v7 compatibility decoder could not decode the image',
    );
  }
  throwIfAborted(options.signal);
  return fingerprintPixels(pixels, {
    algorithm: options.algorithm,
    bitsPerSide: options.bitsPerSide,
    method: options.method,
  });
};

const nodeImageDecoder = {
  decodeImage: decodeNodeImage,
  fingerprintImage: fingerprintNodeImage,
};

export const { decodeImage } = nodeImageDecoder;

export function fingerprintImage(
  source: NodeImageSource,
  options: BlockHashFingerprintOptions & DecodeImageOptions & {
    readonly decoderMode?: NodeImageDecoderMode;
  },
): Promise<BlockHashFingerprint>;
export function fingerprintImage(
  source: NodeImageSource,
  options: PdqFingerprintOptions & DecodeImageOptions & {
    readonly decoderMode?: 'normalized';
  },
): Promise<PdqFingerprint>;
export function fingerprintImage(
  source: NodeImageSource,
  options: NodeFingerprintImageOptions,
): Promise<ImageFingerprint> {
  return nodeImageDecoder.fingerprintImage(source, options);
}
