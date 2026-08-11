import {
  compareCropLocalItemSourceToCrop,
  CROP_LOCAL_ITEM_COLOR_V0_POLICY,
} from './item-comparison';
import type {
  CropLocalItemComparisonEvidence,
  CropLocalItemComparisonOptions,
} from './item-comparison';
import type { CropLocalItemExperimentFingerprint } from './item-fingerprint';

const LOCKED_LOCAL_POLICY = Object.freeze({
  maximumDescriptorDistance: 48,
  ratioPermille: 700,
  maximumResidualPermille: 6,
  minimumInliers: 4,
  minimumInlierRatio: 0.5,
  minimumSpatialZones: 4,
  minimumInformativeCoverage: 0.02,
  denseInformationCutoff: 0.4,
  denseMinimumAgreement: 0.65,
  denseMaximumContradiction: 0.2,
  sparseMinimumAgreement: 0.8,
  sparseMaximumContradiction: 0,
  minimumInformativeZones: 3,
} as const satisfies CropLocalItemComparisonOptions);

const BALANCED_CARD_FALLBACK_POLICY = Object.freeze({
  ...LOCKED_LOCAL_POLICY,
  ...CROP_LOCAL_ITEM_COLOR_V0_POLICY,
  minimumInlierRatio: 0.25,
  minimumSpatialZones: 3,
  denseMinimumAgreement: 0.72,
  denseMaximumContradiction: 0.12,
  sparseMinimumAgreement: 0.85,
  sparseMaximumContradiction: 0,
  minimumInformativeZones: 4,
  minimumColorAgreement: 0.7,
  maximumColorContradiction: 0.05,
  minimumColorZones: 3,
} as const satisfies CropLocalItemComparisonOptions);

/** @internal Development-selected; not a persisted or compatibility-stable profile. */
export const CROP_LOCAL_CARD_RECALL_V0_DEVELOPMENT_POLICY = Object.freeze({
  experimentalProfile: 'crop-local-card-recall-v0-development',
  primary: Object.freeze({
    ...LOCKED_LOCAL_POLICY,
    ...CROP_LOCAL_ITEM_COLOR_V0_POLICY,
  }),
  fallback: BALANCED_CARD_FALLBACK_POLICY,
} as const);

export type CropLocalCardRecallExperimentReason = (
  | 'frozen-item-color-match'
  | 'card-fallback-promoted'
  | 'card-fallback-did-not-match'
);

export interface CropLocalCardRecallExperimentEvidence {
  readonly experimental: true;
  readonly experimentalProfile: 'crop-local-card-recall-v0-development';
  readonly status: CropLocalItemComparisonEvidence['status'];
  readonly direction: 'source-to-crop';
  readonly fallbackPromoted: boolean;
  readonly primary: CropLocalItemComparisonEvidence;
  readonly fallback: CropLocalItemComparisonEvidence | null;
  readonly reasons: readonly CropLocalCardRecallExperimentReason[];
}

/**
 * @internal Preserve the frozen item-color decision, then retry only its misses with the
 * development-selected card geometry and stronger aligned verification policy.
 */
export const compareCropLocalCardRecallExperiment = (
  source: CropLocalItemExperimentFingerprint,
  crop: CropLocalItemExperimentFingerprint,
): CropLocalCardRecallExperimentEvidence => {
  const primary = compareCropLocalItemSourceToCrop(
    source,
    crop,
    CROP_LOCAL_CARD_RECALL_V0_DEVELOPMENT_POLICY.primary,
  );
  if (primary.status === 'match') {
    return {
      experimental: true,
      experimentalProfile: 'crop-local-card-recall-v0-development',
      status: 'match',
      direction: 'source-to-crop',
      fallbackPromoted: false,
      primary,
      fallback: null,
      reasons: ['frozen-item-color-match'],
    };
  }
  const fallback = compareCropLocalItemSourceToCrop(
    source,
    crop,
    CROP_LOCAL_CARD_RECALL_V0_DEVELOPMENT_POLICY.fallback,
  );
  const fallbackPromoted = fallback.status === 'match';
  return {
    experimental: true,
    experimentalProfile: 'crop-local-card-recall-v0-development',
    status: fallbackPromoted ? 'match' : primary.status,
    direction: 'source-to-crop',
    fallbackPromoted,
    primary,
    fallback,
    reasons: [fallbackPromoted ? 'card-fallback-promoted' : 'card-fallback-did-not-match'],
  };
};
