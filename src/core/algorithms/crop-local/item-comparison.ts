import {
  compareCropLocalSourceToCrop,
} from './comparison';
import type {
  CropLocalComparisonEvidence,
  CropLocalComparisonOptions,
  CropLocalComparisonStatus,
  CropLocalTransform,
} from './comparison';
import {
  validateCropLocalItemExperimentFingerprint,
} from './item-fingerprint';
import type {
  CropLocalItemColorSketch,
  CropLocalItemExperimentFingerprint,
} from './item-fingerprint';

export interface CropLocalItemComparisonOptions extends CropLocalComparisonOptions {
  readonly minimumColorSaturation?: number;
  readonly colorAgreementDistance?: number;
  readonly colorContradictionDistance?: number;
  readonly minimumColorInformativeCoverage?: number;
  readonly minimumColorAgreement?: number;
  readonly maximumColorContradiction?: number;
  readonly minimumColorZones?: number;
}

export interface CropLocalItemColorEvidence {
  readonly verifiedSamples: number;
  readonly informativeSamples: number;
  readonly informativeCoverage: number;
  readonly agreementScore: number;
  readonly contradictionScore: number;
  readonly meanDistance: number;
  readonly informativeZones: number;
}

/** @internal Development-selected policy; requires confirmation on a fresh untouched holdout. */
export const CROP_LOCAL_ITEM_COLOR_V0_POLICY = Object.freeze({
  minimumColorSaturation: 12,
  colorAgreementDistance: 16,
  colorContradictionDistance: 48,
  minimumColorInformativeCoverage: 0.02,
  minimumColorAgreement: 0.6,
  maximumColorContradiction: 0.1,
  minimumColorZones: 2,
} as const);

export type CropLocalItemSignal = 'supporting' | 'contradicting' | 'inconclusive';

export type CropLocalItemComparisonReason = (
  | 'local-evidence-did-not-match'
  | 'item-color-inconclusive'
  | 'item-color-disagrees'
  | 'item-color-contradictions'
  | 'local-geometry-content-and-item-color-agree'
);

export interface CropLocalItemComparisonEvidence {
  readonly status: CropLocalComparisonStatus;
  readonly direction: 'source-to-crop';
  readonly itemSignal: CropLocalItemSignal;
  readonly local: CropLocalComparisonEvidence;
  readonly color: CropLocalItemColorEvidence;
  readonly reasons: readonly CropLocalItemComparisonReason[];
}

interface DecodedColorSketch {
  readonly blueDifference: Uint8Array;
  readonly redDifference: Uint8Array;
}

const COLOR_CACHE = new WeakMap<CropLocalItemColorSketch, DecodedColorSketch>();

const hexBytes = (value: string): Uint8Array => {
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
};

const decodedColor = (sketch: CropLocalItemColorSketch): DecodedColorSketch => {
  const cached = COLOR_CACHE.get(sketch);
  if (cached !== undefined) return cached;
  const output = {
    blueDifference: hexBytes(sketch.blueDifference),
    redDifference: hexBytes(sketch.redDifference),
  };
  COLOR_CACHE.set(sketch, output);
  return output;
};

const bilinear = (
  values: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number => {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fractionX = x - Math.floor(x);
  const fractionY = y - Math.floor(y);
  const top = values[y0 * width + x0] * (1 - fractionX) + values[y0 * width + x1] * fractionX;
  const bottom = values[y1 * width + x0] * (1 - fractionX) + values[y1 * width + x1] * fractionX;
  return top * (1 - fractionY) + bottom * fractionY;
};

const emptyColorEvidence = (): CropLocalItemColorEvidence => ({
  verifiedSamples: 0,
  informativeSamples: 0,
  informativeCoverage: 0,
  agreementScore: 0,
  contradictionScore: 0,
  meanDistance: 0,
  informativeZones: 0,
});

const verifyColor = (
  source: CropLocalItemExperimentFingerprint,
  crop: CropLocalItemExperimentFingerprint,
  transform: CropLocalTransform,
  minimumSaturation: number,
  agreementDistance: number,
  contradictionDistance: number,
): CropLocalItemColorEvidence => {
  const sourceSketch = source.colorVerification;
  const cropSketch = crop.colorVerification;
  const sourceColor = decodedColor(sourceSketch);
  const cropColor = decodedColor(cropSketch);
  let verifiedSamples = 0;
  let informativeSamples = 0;
  let agreements = 0;
  let contradictions = 0;
  let totalDistance = 0;
  const zones = new Set<string>();
  for (let sourceY = 0; sourceY < sourceSketch.height; sourceY += 1) {
    const sourceLocalY = (sourceY + 0.5) * source.local.sourceHeight / sourceSketch.height;
    const cropLocalY = (sourceLocalY - transform.translationY) / transform.scale;
    if (cropLocalY < 0 || cropLocalY >= crop.local.sourceHeight) continue;
    const cropY = cropLocalY * cropSketch.height / crop.local.sourceHeight - 0.5;
    for (let sourceX = 0; sourceX < sourceSketch.width; sourceX += 1) {
      const sourceLocalX = (sourceX + 0.5) * source.local.sourceWidth / sourceSketch.width;
      const cropLocalX = (sourceLocalX - transform.translationX) / transform.scale;
      if (cropLocalX < 0 || cropLocalX >= crop.local.sourceWidth) continue;
      const cropX = cropLocalX * cropSketch.width / crop.local.sourceWidth - 0.5;
      const index = sourceY * sourceSketch.width + sourceX;
      const sourceBlue = sourceColor.blueDifference[index];
      const sourceRed = sourceColor.redDifference[index];
      const cropBlue = bilinear(
        cropColor.blueDifference,
        cropSketch.width,
        cropSketch.height,
        cropX,
        cropY,
      );
      const cropRed = bilinear(
        cropColor.redDifference,
        cropSketch.width,
        cropSketch.height,
        cropX,
        cropY,
      );
      verifiedSamples += 1;
      const sourceSaturation = Math.abs(sourceBlue - 128) + Math.abs(sourceRed - 128);
      const cropSaturation = Math.abs(cropBlue - 128) + Math.abs(cropRed - 128);
      if (Math.max(sourceSaturation, cropSaturation) < minimumSaturation) continue;
      informativeSamples += 1;
      const colorDistance = Math.abs(sourceBlue - cropBlue) + Math.abs(sourceRed - cropRed);
      totalDistance += colorDistance;
      if (colorDistance <= agreementDistance) agreements += 1;
      if (colorDistance >= contradictionDistance) contradictions += 1;
      zones.add(`${Math.min(3, Math.floor(sourceX * 4 / sourceSketch.width))}:${Math.min(3, Math.floor(sourceY * 4 / sourceSketch.height))}`);
    }
  }
  return {
    verifiedSamples,
    informativeSamples,
    informativeCoverage: verifiedSamples === 0 ? 0 : informativeSamples / verifiedSamples,
    agreementScore: informativeSamples === 0 ? 0 : agreements / informativeSamples,
    contradictionScore: informativeSamples === 0 ? 0 : contradictions / informativeSamples,
    meanDistance: informativeSamples === 0 ? 0 : totalDistance / informativeSamples,
    informativeZones: zones.size,
  };
};

const validateRatio = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be from 0 through 1`);
  }
};

/** @internal Base crop-local matching with a supplemental aligned item-color veto. */
export const compareCropLocalItemSourceToCrop = (
  source: CropLocalItemExperimentFingerprint,
  crop: CropLocalItemExperimentFingerprint,
  options: CropLocalItemComparisonOptions = {},
): CropLocalItemComparisonEvidence => {
  validateCropLocalItemExperimentFingerprint(source);
  validateCropLocalItemExperimentFingerprint(crop);
  const minimumColorSaturation = options.minimumColorSaturation
    ?? CROP_LOCAL_ITEM_COLOR_V0_POLICY.minimumColorSaturation;
  const colorAgreementDistance = options.colorAgreementDistance
    ?? CROP_LOCAL_ITEM_COLOR_V0_POLICY.colorAgreementDistance;
  const colorContradictionDistance = options.colorContradictionDistance
    ?? CROP_LOCAL_ITEM_COLOR_V0_POLICY.colorContradictionDistance;
  const minimumColorInformativeCoverage = options.minimumColorInformativeCoverage
    ?? CROP_LOCAL_ITEM_COLOR_V0_POLICY.minimumColorInformativeCoverage;
  const minimumColorAgreement = options.minimumColorAgreement
    ?? CROP_LOCAL_ITEM_COLOR_V0_POLICY.minimumColorAgreement;
  const maximumColorContradiction = options.maximumColorContradiction
    ?? CROP_LOCAL_ITEM_COLOR_V0_POLICY.maximumColorContradiction;
  const minimumColorZones = options.minimumColorZones
    ?? CROP_LOCAL_ITEM_COLOR_V0_POLICY.minimumColorZones;
  for (const [value, minimum, maximum, name] of [
    [minimumColorSaturation, 0, 254, 'minimum color saturation'],
    [colorAgreementDistance, 0, 510, 'color agreement distance'],
    [colorContradictionDistance, 0, 510, 'color contradiction distance'],
    [minimumColorZones, 1, 16, 'minimum color zones'],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
    }
  }
  if (colorAgreementDistance > colorContradictionDistance) {
    throw new RangeError('color agreement distance must not exceed color contradiction distance');
  }
  validateRatio(minimumColorInformativeCoverage, 'minimum color informative coverage');
  validateRatio(minimumColorAgreement, 'minimum color agreement');
  validateRatio(maximumColorContradiction, 'maximum color contradiction');
  const localOptions: CropLocalComparisonOptions = options;
  const local = compareCropLocalSourceToCrop(source.local, crop.local, localOptions);
  if (local.status !== 'match' || local.transform === null) {
    return {
      status: local.status,
      direction: 'source-to-crop',
      itemSignal: 'inconclusive',
      local,
      color: emptyColorEvidence(),
      reasons: ['local-evidence-did-not-match'],
    };
  }
  const color = verifyColor(
    source,
    crop,
    local.transform,
    minimumColorSaturation,
    colorAgreementDistance,
    colorContradictionDistance,
  );
  if (
    color.informativeCoverage < minimumColorInformativeCoverage
    || color.informativeZones < minimumColorZones
  ) {
    return {
      status: 'match',
      direction: 'source-to-crop',
      itemSignal: 'inconclusive',
      local,
      color,
      reasons: ['item-color-inconclusive'],
    };
  }
  if (color.agreementScore < minimumColorAgreement) {
    return {
      status: 'no-match',
      direction: 'source-to-crop',
      itemSignal: 'contradicting',
      local,
      color,
      reasons: ['item-color-disagrees'],
    };
  }
  if (color.contradictionScore > maximumColorContradiction) {
    return {
      status: 'no-match',
      direction: 'source-to-crop',
      itemSignal: 'contradicting',
      local,
      color,
      reasons: ['item-color-contradictions'],
    };
  }
  return {
    status: 'match',
    direction: 'source-to-crop',
    itemSignal: 'supporting',
    local,
    color,
    reasons: ['local-geometry-content-and-item-color-agree'],
  };
};
