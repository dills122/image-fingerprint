import { validatePixelSource } from './pixels';
import type {
  Gray8PixelSource,
  PixelSource,
  Rgb8PixelSource,
  Rgba8PixelSource,
} from './types';

const MINIMUM_REGION_DIMENSION = 5;
const UINT8_CLAMPED_ARRAY_TAG = '[object Uint8ClampedArray]';

export interface PixelRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const validateNonNegativeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
};

const validateRegionDimension = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < MINIMUM_REGION_DIMENSION) {
    throw new RangeError(
      `${name} must be an integer of at least ${MINIMUM_REGION_DIMENSION} pixels`,
    );
  }
};

const channelsForFormat = (format: PixelSource['format']): number => {
  switch (format) {
    case 'gray8':
      return 1;
    case 'rgb8':
      return 3;
    case 'rgba8':
      return 4;
  }
};

const allocateRegionData = (
  source: PixelSource,
  length: number,
): Uint8Array | Uint8ClampedArray => {
  if (
    source.format === 'rgba8'
    && Object.prototype.toString.call(source.data) === UINT8_CLAMPED_ARRAY_TAG
  ) {
    return new Uint8ClampedArray(length);
  }
  return new Uint8Array(length);
};

export function extractPixelRegion(
  source: Gray8PixelSource,
  region: PixelRegion,
): Gray8PixelSource;
export function extractPixelRegion(
  source: Rgb8PixelSource,
  region: PixelRegion,
): Rgb8PixelSource;
export function extractPixelRegion(
  source: Rgba8PixelSource,
  region: PixelRegion,
): Rgba8PixelSource;
export function extractPixelRegion(
  source: PixelSource,
  region: PixelRegion,
): PixelSource;
export function extractPixelRegion(
  source: PixelSource,
  region: PixelRegion,
): PixelSource {
  validatePixelSource(source);
  validateNonNegativeInteger(region.x, 'Region x');
  validateNonNegativeInteger(region.y, 'Region y');
  validateRegionDimension(region.width, 'Region width');
  validateRegionDimension(region.height, 'Region height');

  if (
    region.width > source.width
    || region.x > source.width - region.width
    || region.height > source.height
    || region.y > source.height - region.height
  ) {
    throw new RangeError('Pixel region must be fully contained within the source image');
  }

  const channels = channelsForFormat(source.format);
  const rowLength = region.width * channels;
  const outputLength = rowLength * region.height;
  if (!Number.isSafeInteger(outputLength)) {
    throw new RangeError('Pixel region dimensions are too large');
  }

  const data = allocateRegionData(source, outputLength);
  const sourceRowLength = source.width * channels;
  for (let row = 0; row < region.height; row += 1) {
    const sourceStart = (
      (region.y + row) * sourceRowLength
      + region.x * channels
    );
    data.set(
      source.data.subarray(sourceStart, sourceStart + rowLength),
      row * rowLength,
    );
  }

  return {
    format: source.format,
    width: region.width,
    height: region.height,
    data,
  } as PixelSource;
}
