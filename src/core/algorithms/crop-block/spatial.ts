import {
  compareCropBlockSegments,
  type CropBlockComparableSegment,
  type CropBlockComparisonEvidence,
  type CropBlockMatchedPair,
} from './comparison';
import type { SourceCropBox } from './boxes';

export interface CropBlockSpatialSegment extends CropBlockComparableSegment {
  readonly sourceBox: SourceCropBox;
}

export interface CropBlockSpatialFingerprint {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly segments: readonly CropBlockSpatialSegment[];
}

export interface CropBlockTransformEstimate {
  readonly scaleXPermille: number;
  readonly scaleYPermille: number;
  readonly translationXPermille: number;
  readonly translationYPermille: number;
}

export interface CropBlockSpatialComparisonOptions {
  readonly maximumScaleDeviationPermille?: number;
  readonly maximumTranslationDeviationPermille?: number;
  readonly minimumMatchedRegions?: number;
  readonly minimumQueryCoverage?: number;
  readonly minimumCandidateCoverage?: number;
  readonly requirePolarity?: boolean;
}

export interface CropBlockSpatialComparisonEvidence extends CropBlockComparisonEvidence {
  readonly spatialPairs: readonly CropBlockMatchedPair[];
  readonly spatiallyConsistentRegions: number;
  readonly spatialQueryCoverage: number;
  readonly spatialCandidateCoverage: number;
  readonly transform: CropBlockTransformEstimate | null;
  readonly matches: boolean;
}

const validatePermille = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 5000) {
    throw new RangeError(`${name} must be an integer from 0 through 5000`);
  }
};

const validateCoverage = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be from 0 through 1`);
  }
};

const estimateTransform = (
  query: CropBlockSpatialFingerprint,
  candidate: CropBlockSpatialFingerprint,
  pair: CropBlockMatchedPair,
): CropBlockTransformEstimate => {
  const queryBox = query.segments[pair.queryIndex].sourceBox;
  const candidateBox = candidate.segments[pair.candidateIndex].sourceBox;
  const scaleXPermille = Math.round((
    queryBox.width * candidate.sourceWidth * 1000
  ) / (candidateBox.width * query.sourceWidth));
  const scaleYPermille = Math.round((
    queryBox.height * candidate.sourceHeight * 1000
  ) / (candidateBox.height * query.sourceHeight));
  return {
    scaleXPermille,
    scaleYPermille,
    translationXPermille: Math.round(
      (queryBox.x * 1000) / query.sourceWidth
      - (candidateBox.x * scaleXPermille) / candidate.sourceWidth,
    ),
    translationYPermille: Math.round(
      (queryBox.y * 1000) / query.sourceHeight
      - (candidateBox.y * scaleYPermille) / candidate.sourceHeight,
    ),
  };
};

const within = (
  left: CropBlockTransformEstimate,
  right: CropBlockTransformEstimate,
  maximumScaleDeviationPermille: number,
  maximumTranslationDeviationPermille: number,
): boolean => (
  Math.abs(left.scaleXPermille - right.scaleXPermille) <= maximumScaleDeviationPermille
  && Math.abs(left.scaleYPermille - right.scaleYPermille) <= maximumScaleDeviationPermille
  && Math.abs(left.translationXPermille - right.translationXPermille)
    <= maximumTranslationDeviationPermille
  && Math.abs(left.translationYPermille - right.translationYPermille)
    <= maximumTranslationDeviationPermille
);

const comparePairLists = (
  left: readonly CropBlockMatchedPair[],
  right: readonly CropBlockMatchedPair[],
): number => {
  if (left.length !== right.length) return right.length - left.length;
  const leftDistance = left.reduce((total, pair) => total + pair.distance, 0);
  const rightDistance = right.reduce((total, pair) => total + pair.distance, 0);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].queryIndex !== right[index].queryIndex) {
      return left[index].queryIndex - right[index].queryIndex;
    }
    if (left[index].candidateIndex !== right[index].candidateIndex) {
      return left[index].candidateIndex - right[index].candidateIndex;
    }
  }
  return 0;
};

/** @internal Experimental crop-transform consistency applied after one-to-one hash matching. */
export const compareCropBlockSpatial = (
  query: CropBlockSpatialFingerprint,
  candidate: CropBlockSpatialFingerprint,
  maximumRegionDistance: number,
  options: CropBlockSpatialComparisonOptions = {},
): CropBlockSpatialComparisonEvidence => {
  const maximumScaleDeviationPermille = options.maximumScaleDeviationPermille ?? 150;
  const maximumTranslationDeviationPermille = options.maximumTranslationDeviationPermille ?? 100;
  const minimumMatchedRegions = options.minimumMatchedRegions ?? 2;
  const minimumQueryCoverage = options.minimumQueryCoverage ?? 0.25;
  const minimumCandidateCoverage = options.minimumCandidateCoverage ?? 0.25;
  validatePermille(maximumScaleDeviationPermille, 'maximum scale deviation permille');
  validatePermille(maximumTranslationDeviationPermille, 'maximum translation deviation permille');
  if (!Number.isSafeInteger(minimumMatchedRegions) || minimumMatchedRegions < 1 || minimumMatchedRegions > 1024) {
    throw new RangeError('minimum matched regions must be an integer from 1 through 1024');
  }
  validateCoverage(minimumQueryCoverage, 'minimum query coverage');
  validateCoverage(minimumCandidateCoverage, 'minimum candidate coverage');
  const evidence = compareCropBlockSegments(
    query.segments,
    candidate.segments,
    'one-to-one',
    maximumRegionDistance,
    { allowFallback: false, requirePolarity: options.requirePolarity ?? true },
  );
  const estimates = evidence.pairs.map((pair) => estimateTransform(query, candidate, pair));
  const candidates = evidence.pairs.map((_, anchorIndex) => evidence.pairs.filter((pair, index) => (
    within(
      estimates[anchorIndex],
      estimates[index],
      maximumScaleDeviationPermille,
      maximumTranslationDeviationPermille,
    )
  )));
  const spatialPairs = (candidates.sort(comparePairLists)[0] ?? [])
    .slice()
    .sort((left, right) => left.queryIndex - right.queryIndex);
  const anchorPair = spatialPairs[0];
  const transform = anchorPair === undefined
    ? null
    : estimateTransform(query, candidate, anchorPair);
  const spatiallyConsistentRegions = spatialPairs.length;
  const spatialQueryCoverage = query.segments.length === 0
    ? 0 : spatiallyConsistentRegions / query.segments.length;
  const spatialCandidateCoverage = candidate.segments.length === 0
    ? 0 : new Set(spatialPairs.map((pair) => pair.candidateIndex)).size / candidate.segments.length;
  return {
    ...evidence,
    spatialPairs,
    spatiallyConsistentRegions,
    spatialQueryCoverage,
    spatialCandidateCoverage,
    transform,
    matches: spatiallyConsistentRegions >= minimumMatchedRegions
      && spatialQueryCoverage >= minimumQueryCoverage
      && spatialCandidateCoverage >= minimumCandidateCoverage,
  };
};
