import type {
  BlockHashPixelSource,
  Gray8PixelSource,
  PixelSource,
  Rgb8PixelSource,
  Rgba8PixelSource,
  RgbaImageData,
} from './types';

type NormalizedPixelSource = Gray8PixelSource | Rgb8PixelSource;

const UINT8_ARRAY_TAG = '[object Uint8Array]';
const UINT8_CLAMPED_ARRAY_TAG = '[object Uint8ClampedArray]';
const PDQ_MINIMUM_DIMENSION = 5;

const typedArrayTag = (data: unknown): string => (
  Object.prototype.toString.call(data)
);

const isArrayBufferView = (data: unknown): data is ArrayBufferView => (
  ArrayBuffer.isView(data)
);

const validatePositiveInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
};

const validateDimensions = (
  image: { readonly width: number; readonly height: number },
  minimumDimension: number,
): void => {
  validatePositiveInteger(image.width, 'Image width');
  validatePositiveInteger(image.height, 'Image height');

  if (image.width < minimumDimension) {
    throw new RangeError(`Image width must be at least ${minimumDimension} pixels`);
  }
  if (image.height < minimumDimension) {
    throw new RangeError(`Image height must be at least ${minimumDimension} pixels`);
  }
};

const validatePackedLength = (
  image: { readonly width: number; readonly height: number; readonly data: ArrayLike<number> },
  channels: number,
  format: string,
): void => {
  const expectedLength = image.width * image.height * channels;
  if (!Number.isSafeInteger(expectedLength)) {
    throw new RangeError('Image dimensions are too large');
  }

  if (image.data.length !== expectedLength) {
    throw new RangeError(
      `Expected ${expectedLength} ${format} values for a ${image.width}x${image.height} image, received ${image.data.length}`,
    );
  }
};

const validateUint8Data = (
  image: Gray8PixelSource | Rgb8PixelSource,
): void => {
  if (
    !isArrayBufferView(image.data)
    || typedArrayTag(image.data) !== UINT8_ARRAY_TAG
  ) {
    throw new TypeError(`${image.format} pixel data must be a Uint8Array`);
  }
};

const validateRgbaData = (
  image: RgbaImageData | Rgba8PixelSource,
  format?: string,
): void => {
  const dataType = typedArrayTag(image.data);
  if (
    !isArrayBufferView(image.data)
    || (
      dataType !== UINT8_ARRAY_TAG
      && dataType !== UINT8_CLAMPED_ARRAY_TAG
    )
  ) {
    const subject = format === undefined ? 'Pixel data' : `${format} pixel data`;
    throw new TypeError(
      `${subject} must be a Uint8Array or Uint8ClampedArray`,
    );
  }
};

/** @internal Shared validation for tagged, tightly packed pixel sources. */
export const validatePixelSource = (image: PixelSource): void => {
  validateDimensions(image, PDQ_MINIMUM_DIMENSION);

  switch (image.format) {
    case 'gray8':
      validateUint8Data(image);
      validatePackedLength(image, 1, image.format);
      break;
    case 'rgb8':
      validateUint8Data(image);
      validatePackedLength(image, 3, image.format);
      break;
    case 'rgba8':
      validateRgbaData(image, image.format);
      validatePackedLength(image, 4, image.format);
      break;
    default: {
      const unsupported = image as { readonly format: string };
      throw new RangeError(`Unsupported pixel format: ${unsupported.format}`);
    }
  }
};

/** @internal Shared runtime validation for the public BlockHash dispatcher. */
export const validateBlockHashPixelSource = (
  image: BlockHashPixelSource,
): void => {
  const format = (image as { readonly format?: unknown }).format;
  if (format === 'rgba8') {
    validatePixelSource(image as Rgba8PixelSource);
    return;
  }
  if (format === 'gray8' || format === 'rgb8') {
    throw new RangeError('blockhash-v1 requires RGBA pixels');
  }

  validateDimensions(image, 1);
  validateRgbaData(image);
  validatePackedLength(image, 4, 'RGBA');
};

/** @internal Frozen PDQ pixel normalization used by later numeric stages. */
export const normalizePixelSource = (
  image: PixelSource,
): NormalizedPixelSource => {
  validatePixelSource(image);

  if (image.format === 'gray8' || image.format === 'rgb8') {
    return {
      format: image.format,
      width: image.width,
      height: image.height,
      data: image.data,
    };
  }

  const data = new Uint8Array(image.width * image.height * 3);
  for (let sourceIndex = 0, targetIndex = 0;
    sourceIndex < image.data.length;
    sourceIndex += 4, targetIndex += 3) {
    const alpha = image.data[sourceIndex + 3];
    const whiteContribution = 255 * (255 - alpha);

    for (let channel = 0; channel < 3; channel += 1) {
      data[targetIndex + channel] = Math.floor(
        (
          image.data[sourceIndex + channel] * alpha
          + whiteContribution
          + 127
        ) / 255,
      );
    }
  }

  return {
    format: 'rgb8',
    width: image.width,
    height: image.height,
    data,
  };
};
