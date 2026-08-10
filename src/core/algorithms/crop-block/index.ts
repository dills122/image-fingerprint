import blockHash from '../../../block-hash';
import { fingerprintPdq } from '../pdq';
import { extractPixelRegion } from '../../pixel-region';
import { validatePixelSource } from '../../pixels';
import type { Rgba8PixelSource } from '../../types';
import { mapGridBoxToSource, type SourceCropBox } from './boxes';
import {
  preprocessCropBlock,
  type CropBlockPreprocessCandidate,
} from './preprocess';
import {
  compareCropBlockRegions,
  segmentBinaryRegions,
  type CropBlockBox,
  type CropBlockSegmentKind,
} from './segment';
import {
  measureCropBlockRegionInformation,
  type CropBlockRegionInformation,
} from './quality';

export * from './boxes';
export * from './comparison';
export * from './preprocess';
export * from './quality';
export * from './segment';
export * from './spatial';

export interface CropBlockExperimentOptions {
  readonly preprocessing: CropBlockPreprocessCandidate;
  readonly gridSize?: number;
  readonly minimumArea?: number;
  readonly maximumSegments?: number | null;
  readonly fallback?: 'full-image' | 'empty';
  readonly deduplicate?: boolean;
  readonly regionAlgorithm?: 'blockhash-v1' | 'pdq-v1';
}

export interface CropBlockSegmentFingerprint {
  readonly kind: CropBlockSegmentKind;
  readonly area: number;
  readonly box: CropBlockBox;
  readonly sourceBox: SourceCropBox;
  readonly hash: string;
  readonly quality?: number;
}

export interface CropBlockV2SegmentFingerprint extends CropBlockSegmentFingerprint,
  CropBlockRegionInformation {}

export interface CropBlockV2ExperimentOptions extends CropBlockExperimentOptions {
  readonly minimumEntropyMilliBits?: number;
  readonly minimumEdgeDensityPermille?: number;
  readonly minimumLuminanceRange?: number;
  readonly deduplicateChildHashes?: boolean;
}

export interface CropBlockV2ExperimentFingerprint extends CropBlockExperimentFingerprint {
  readonly experimentalProfile: 'crop-block-v2-distinctive-regions';
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly minimumEntropyMilliBits: number;
  readonly minimumEdgeDensityPermille: number;
  readonly minimumLuminanceRange: number;
  readonly deduplicateChildHashes: boolean;
  readonly segments: readonly CropBlockV2SegmentFingerprint[];
}

export interface CropBlockExperimentFingerprint {
  readonly experimental: true;
  readonly preprocessing: CropBlockPreprocessCandidate;
  readonly gridSize: number;
  readonly minimumArea: number;
  readonly maximumSegments: number | null;
  readonly fallback: 'full-image' | 'empty';
  readonly regionAlgorithm: 'blockhash-v1' | 'pdq-v1';
  readonly regionBitLength: 256;
  readonly segments: readonly CropBlockSegmentFingerprint[];
}

const validateMaximumSegments = (value: number | null): void => {
  if (value !== null && (!Number.isSafeInteger(value) || value <= 0 || value > 1024)) {
    throw new RangeError('maximum segments must be null or an integer from 1 through 1024');
  }
};

export const fingerprintCropBlockExperiment = (
  source: Rgba8PixelSource,
  options: CropBlockExperimentOptions,
): CropBlockExperimentFingerprint => {
  validatePixelSource(source);
  if (source.format !== 'rgba8') {
    throw new RangeError('crop-block experiment requires rgba8 pixels');
  }
  if (source.width < 16 || source.height < 16) {
    throw new RangeError('crop-block experiment requires dimensions of at least 16 pixels');
  }
  const gridSize = options.gridSize ?? 300;
  const minimumArea = options.minimumArea ?? 500;
  const maximumSegments = options.maximumSegments === undefined
    ? 32
    : options.maximumSegments;
  const fallback = options.fallback ?? 'full-image';
  const regionAlgorithm = options.regionAlgorithm ?? 'blockhash-v1';
  validateMaximumSegments(maximumSegments);
  if (fallback !== 'full-image' && fallback !== 'empty') {
    throw new RangeError('crop-block fallback must be full-image or empty');
  }
  if (regionAlgorithm !== 'blockhash-v1' && regionAlgorithm !== 'pdq-v1') {
    throw new RangeError('crop-block region algorithm must be blockhash-v1 or pdq-v1');
  }

  const preprocessed = preprocessCropBlock(source, options.preprocessing, gridSize);
  let regions = segmentBinaryRegions(preprocessed, gridSize, gridSize, minimumArea);
  if (regions.length === 0 && fallback === 'full-image') {
    regions = [{
      kind: 'fallback',
      area: gridSize * gridSize,
      box: [0, 0, gridSize, gridSize],
    }];
  }
  if (maximumSegments !== null) regions = regions.slice(0, maximumSegments);

  let segments = regions.flatMap((region): CropBlockSegmentFingerprint[] => {
    const sourceBox = mapGridBoxToSource(
      region.box,
      gridSize,
      source.width,
      source.height,
    );
    if (sourceBox.width < 16 || sourceBox.height < 16) return [];
    const crop = extractPixelRegion(source, sourceBox);
    const child = regionAlgorithm === 'pdq-v1'
      ? fingerprintPdq(crop)
      : { hash: blockHash(crop, 16, 2) };
    return [{
      ...region,
      sourceBox,
      hash: child.hash,
      ...('quality' in child ? { quality: child.quality } : {}),
    }];
  });
  segments = segments.sort((left, right) => (
    compareCropBlockRegions(left, right) || left.hash.localeCompare(right.hash)
  ));
  if (options.deduplicate === true) {
    const seen = new Set<string>();
    segments = segments.filter((segment) => {
      const key = `${segment.kind}:${segment.box.join(',')}:${segment.hash}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return {
    experimental: true,
    preprocessing: options.preprocessing,
    gridSize,
    minimumArea,
    maximumSegments,
    fallback,
    regionAlgorithm,
    regionBitLength: 256,
    segments,
  };
};

const validateInformationThreshold = (
  value: number,
  maximum: number,
  name: string,
): void => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer from 0 through ${maximum}`);
  }
};

/** @internal Distinctive-region successor experiment; not a public algorithm profile. */
export const fingerprintCropBlockV2Experiment = (
  source: Rgba8PixelSource,
  options: CropBlockV2ExperimentOptions,
): CropBlockV2ExperimentFingerprint => {
  const minimumEntropyMilliBits = options.minimumEntropyMilliBits ?? 0;
  const minimumEdgeDensityPermille = options.minimumEdgeDensityPermille ?? 0;
  const minimumLuminanceRange = options.minimumLuminanceRange ?? 0;
  const deduplicateChildHashes = options.deduplicateChildHashes ?? true;
  validateInformationThreshold(minimumEntropyMilliBits, 8000, 'minimum entropy millibits');
  validateInformationThreshold(minimumEdgeDensityPermille, 1000, 'minimum edge density permille');
  validateInformationThreshold(minimumLuminanceRange, 255, 'minimum luminance range');
  const base = fingerprintCropBlockExperiment(source, {
    ...options,
    deduplicate: false,
  });
  const measured = base.segments.map((segment): CropBlockV2SegmentFingerprint => {
    const crop = extractPixelRegion(source, segment.sourceBox);
    return { ...segment, ...measureCropBlockRegionInformation(crop) };
  });
  const seen = new Set<string>();
  const segments = measured.filter((segment) => {
    if (
      segment.entropyMilliBits < minimumEntropyMilliBits
      || segment.edgeDensityPermille < minimumEdgeDensityPermille
      || segment.luminanceRange < minimumLuminanceRange
    ) return false;
    if (!deduplicateChildHashes) return true;
    if (seen.has(segment.hash)) return false;
    seen.add(segment.hash);
    return true;
  });
  return {
    ...base,
    experimentalProfile: 'crop-block-v2-distinctive-regions',
    sourceWidth: source.width,
    sourceHeight: source.height,
    minimumEntropyMilliBits,
    minimumEdgeDensityPermille,
    minimumLuminanceRange,
    deduplicateChildHashes,
    segments,
  };
};
