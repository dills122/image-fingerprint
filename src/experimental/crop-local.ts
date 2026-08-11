/**
 * Experimental crop-aware matching for decoded RGBA pixels.
 *
 * This package subpath is an explicit opt-in preview. Function names, fingerprint shapes,
 * profile identifiers, defaults, and thresholds may change or be removed in any release.
 * Crop-Local fingerprints are intentionally excluded from the stable fingerprint codec.
 */
export {
  fingerprintCropLocalItemExperiment as fingerprintCropLocalItem,
  fingerprintCropLocalItemPackedExperiment as fingerprintCropLocalItemPacked,
  packCropLocalItemExperimentFingerprint as packCropLocalItemFingerprint,
  unpackCropLocalItemExperimentFingerprint as unpackCropLocalItemFingerprint,
  validateCropLocalItemExperimentFingerprint as validateCropLocalItemFingerprint,
} from '../core/algorithms/crop-local/item-fingerprint';
export type {
  CropLocalItemColorSketch,
  CropLocalItemExperimentFingerprint as CropLocalItemFingerprint,
  CropLocalItemExperimentOptions as CropLocalItemOptions,
  CropLocalItemPackedExperimentFingerprint as CropLocalItemPackedFingerprint,
} from '../core/algorithms/crop-local/item-fingerprint';

export {
  compareCropLocalItemSourceToCrop as compareCropLocalSourceToCrop,
  compareCropLocalItemPackedSourceToCrop as comparePackedCropLocalSourceToCrop,
  CROP_LOCAL_ITEM_COLOR_V0_POLICY as CROP_LOCAL_ITEM_V0_POLICY,
} from '../core/algorithms/crop-local/item-comparison';
export type {
  CropLocalItemColorEvidence,
  CropLocalItemComparisonEvidence as CropLocalComparisonEvidence,
  CropLocalItemComparisonOptions as CropLocalComparisonOptions,
  CropLocalItemComparisonReason as CropLocalComparisonReason,
  CropLocalItemSignal,
} from '../core/algorithms/crop-local/item-comparison';
export type {
  CropLocalComparisonStatus,
  CropLocalModelEvidence,
  CropLocalTransform,
  CropLocalVerificationEvidence,
} from '../core/algorithms/crop-local/comparison';
