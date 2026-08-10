import type {
  CropKeypointDescriptor,
  CropKeypointExperimentFingerprint,
} from './fingerprint';

export interface CropKeypointComparisonOptions {
  readonly maximumDescriptorDistance?: number;
  readonly ratioPermille?: number;
  readonly minimumInliers?: number;
  readonly minimumInlierRatio?: number;
  readonly maximumResidualPermille?: number;
  readonly minimumScalePermille?: number;
  readonly maximumScalePermille?: number;
  readonly maximumColorDistance?: number;
  readonly maximumVerificationColorDistance?: number;
  readonly minimumVerificationSamples?: number;
}

export interface CropKeypointMatch {
  readonly queryIndex: number;
  readonly candidateIndex: number;
  readonly distance: number;
}

export interface CropKeypointTransform {
  readonly scale: number;
  readonly translationX: number;
  readonly translationY: number;
}

export interface CropKeypointComparisonEvidence {
  readonly queryKeypoints: number;
  readonly candidateKeypoints: number;
  readonly tentativeMatches: readonly CropKeypointMatch[];
  readonly inliers: readonly CropKeypointMatch[];
  readonly inlierRatio: number;
  readonly transform: CropKeypointTransform | null;
  readonly verificationMeanColorDistance: number | null;
  readonly verificationSamples: number;
  readonly matches: boolean;
}

const POPCOUNT = Uint8Array.of(0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4);
const WORD_CACHE = new WeakMap<CropKeypointDescriptor, Uint32Array>();

const descriptorWords = (keypoint: CropKeypointDescriptor): Uint32Array => {
  const cached = WORD_CACHE.get(keypoint);
  if (cached !== undefined) return cached;
  const words = new Uint32Array(8);
  for (let index = 0; index < words.length; index += 1) {
    words[index] = Number.parseInt(keypoint.descriptor.slice(index * 8, index * 8 + 8), 16);
  }
  WORD_CACHE.set(keypoint, words);
  return words;
};

const popcount32 = (input: number): number => {
  let value = input - ((input >>> 1) & 0x5555_5555);
  value = (value & 0x3333_3333) + ((value >>> 2) & 0x3333_3333);
  return (((value + (value >>> 4)) & 0x0f0f_0f0f) * 0x0101_0101) >>> 24;
};

const descriptorDistance = (
  left: CropKeypointDescriptor,
  right: CropKeypointDescriptor,
): number => {
  const leftWords = descriptorWords(left);
  const rightWords = descriptorWords(right);
  let distance = 0;
  for (let index = 0; index < leftWords.length; index += 1) {
    distance += popcount32(leftWords[index] ^ rightWords[index]);
  }
  return distance;
};

export const cropKeypointHammingDistance = (left: string, right: string): number => {
  if (left.length !== 64 || right.length !== 64 || !/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    throw new RangeError('crop-keypoint descriptors must be 64 lowercase hexadecimal characters');
  }
  let distance = 0;
  for (let index = 0; index < 64; index += 1) {
    distance += POPCOUNT[Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16)];
  }
  return distance;
};

const nearestTwo = (
  source: CropKeypointDescriptor,
  targets: readonly CropKeypointDescriptor[],
  maximumColorDistance: number,
): readonly [number, number, number] => {
  let bestIndex = -1;
  let best = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;
  targets.forEach((target, index) => {
    const colorDistance = Math.abs(source.meanRed - target.meanRed)
      + Math.abs(source.meanGreen - target.meanGreen)
      + Math.abs(source.meanBlue - target.meanBlue);
    if (colorDistance > maximumColorDistance) return;
    const distance = descriptorDistance(source, target);
    if (distance < best) {
      second = best;
      best = distance;
      bestIndex = index;
    } else if (distance < second) {
      second = distance;
    }
  });
  return [bestIndex, best, second];
};

const tentativeMatches = (
  query: readonly CropKeypointDescriptor[],
  candidate: readonly CropKeypointDescriptor[],
  maximumDescriptorDistance: number,
  ratioPermille: number,
  maximumColorDistance: number,
): CropKeypointMatch[] => {
  if (query.length === 0 || candidate.length < 2) return [];
  const candidateNearest = candidate.map((keypoint) => nearestTwo(
    keypoint, query, maximumColorDistance,
  )[0]);
  return query.flatMap((keypoint, queryIndex) => {
    const [candidateIndex, distance, secondDistance] = nearestTwo(
      keypoint, candidate, maximumColorDistance,
    );
    if (
      candidateIndex < 0
      || distance > maximumDescriptorDistance
      || !Number.isFinite(secondDistance)
      || secondDistance === 0
      || distance * 1000 > secondDistance * ratioPermille
      || candidateNearest[candidateIndex] !== queryIndex
    ) return [];
    return [{ queryIndex, candidateIndex, distance }];
  });
};

const inliersForModel = (
  matches: readonly CropKeypointMatch[],
  query: readonly CropKeypointDescriptor[],
  candidate: readonly CropKeypointDescriptor[],
  model: CropKeypointTransform,
  maximumResidual: number,
): CropKeypointMatch[] => matches.filter((match) => {
  const queryPoint = query[match.queryIndex];
  const candidatePoint = candidate[match.candidateIndex];
  const differenceX = queryPoint.x - (model.scale * candidatePoint.x + model.translationX);
  const differenceY = queryPoint.y - (model.scale * candidatePoint.y + model.translationY);
  return differenceX ** 2 + differenceY ** 2 <= maximumResidual ** 2;
});

const compareInlierSets = (
  left: readonly CropKeypointMatch[],
  right: readonly CropKeypointMatch[],
): number => {
  if (left.length !== right.length) return right.length - left.length;
  const leftDistance = left.reduce((total, match) => total + match.distance, 0);
  const rightDistance = right.reduce((total, match) => total + match.distance, 0);
  return leftDistance - rightDistance;
};

const verifyTransformedOverlap = (
  query: CropKeypointExperimentFingerprint,
  candidate: CropKeypointExperimentFingerprint,
  model: CropKeypointTransform | null,
): { meanColorDistance: number | null; samples: number } => {
  if (model === null || query.verificationGridSize !== candidate.verificationGridSize) {
    return { meanColorDistance: null, samples: 0 };
  }
  const size = query.verificationGridSize;
  let total = 0;
  let samples = 0;
  for (let candidateY = 0; candidateY < size; candidateY += 1) {
    const y = model.scale * ((candidateY + 0.5) * candidate.sourceHeight / size)
      + model.translationY;
    if (y < 0 || y >= query.sourceHeight) continue;
    const queryY = Math.min(size - 1, Math.floor((y * size) / query.sourceHeight));
    for (let candidateX = 0; candidateX < size; candidateX += 1) {
      const x = model.scale * ((candidateX + 0.5) * candidate.sourceWidth / size)
        + model.translationX;
      if (x < 0 || x >= query.sourceWidth) continue;
      const queryX = Math.min(size - 1, Math.floor((x * size) / query.sourceWidth));
      const candidateIndex = (candidateY * size + candidateX) * 6;
      const queryIndex = (queryY * size + queryX) * 6;
      for (let channel = 0; channel < 3; channel += 1) {
        total += Math.abs(
          Number.parseInt(candidate.verificationGrid.slice(
            candidateIndex + channel * 2, candidateIndex + channel * 2 + 2,
          ), 16)
          - Number.parseInt(query.verificationGrid.slice(
            queryIndex + channel * 2, queryIndex + channel * 2 + 2,
          ), 16),
        );
      }
      samples += 1;
    }
  }
  return {
    meanColorDistance: samples === 0 ? null : total / (samples * 3),
    samples,
  };
};

/** @internal Bounded mutual matching plus deterministic uniform-scale/translation consensus. */
export const compareCropKeypointFingerprints = (
  query: CropKeypointExperimentFingerprint,
  candidate: CropKeypointExperimentFingerprint,
  options: CropKeypointComparisonOptions = {},
): CropKeypointComparisonEvidence => {
  const maximumDescriptorDistance = options.maximumDescriptorDistance ?? 64;
  const ratioPermille = options.ratioPermille ?? 800;
  const minimumInliers = options.minimumInliers ?? 4;
  const minimumInlierRatio = options.minimumInlierRatio ?? 0.25;
  const maximumResidualPermille = options.maximumResidualPermille ?? 8;
  const minimumScalePermille = options.minimumScalePermille ?? 250;
  const maximumScalePermille = options.maximumScalePermille ?? 4000;
  const maximumColorDistance = options.maximumColorDistance ?? 96;
  const maximumVerificationColorDistance = options.maximumVerificationColorDistance ?? 12;
  const minimumVerificationSamples = options.minimumVerificationSamples ?? 16;
  for (const [value, minimum, maximum, name] of [
    [maximumDescriptorDistance, 0, 256, 'maximum descriptor distance'],
    [ratioPermille, 1, 1000, 'ratio permille'],
    [minimumInliers, 1, 2048, 'minimum inliers'],
    [maximumResidualPermille, 1, 1000, 'maximum residual permille'],
    [minimumScalePermille, 1, 10_000, 'minimum scale permille'],
    [maximumScalePermille, 1, 10_000, 'maximum scale permille'],
    [maximumColorDistance, 0, 765, 'maximum color distance'],
    [minimumVerificationSamples, 1, 4096, 'minimum verification samples'],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
    }
  }
  if (!Number.isFinite(minimumInlierRatio) || minimumInlierRatio < 0 || minimumInlierRatio > 1) {
    throw new RangeError('minimum inlier ratio must be from 0 through 1');
  }
  if (
    !Number.isFinite(maximumVerificationColorDistance)
    || maximumVerificationColorDistance < 0
    || maximumVerificationColorDistance > 255
  ) {
    throw new RangeError('maximum verification color distance must be from 0 through 255');
  }
  if (minimumScalePermille > maximumScalePermille) {
    throw new RangeError('minimum scale permille must not exceed maximum scale permille');
  }
  const tentative = tentativeMatches(
    query.keypoints,
    candidate.keypoints,
    maximumDescriptorDistance,
    ratioPermille,
    maximumColorDistance,
  );
  const maximumResidual = Math.max(2, (
    Math.max(query.sourceWidth, query.sourceHeight) * maximumResidualPermille
  ) / 1000);
  const models: CropKeypointTransform[] = tentative.map((match) => {
    const queryPoint = query.keypoints[match.queryIndex];
    const candidatePoint = candidate.keypoints[match.candidateIndex];
    return {
      scale: 1,
      translationX: queryPoint.x - candidatePoint.x,
      translationY: queryPoint.y - candidatePoint.y,
    };
  });
  for (let left = 0; left < tentative.length; left += 1) {
    for (let right = left + 1; right < tentative.length; right += 1) {
      const leftQuery = query.keypoints[tentative[left].queryIndex];
      const rightQuery = query.keypoints[tentative[right].queryIndex];
      const leftCandidate = candidate.keypoints[tentative[left].candidateIndex];
      const rightCandidate = candidate.keypoints[tentative[right].candidateIndex];
      const candidateX = rightCandidate.x - leftCandidate.x;
      const candidateY = rightCandidate.y - leftCandidate.y;
      const denominator = candidateX ** 2 + candidateY ** 2;
      if (denominator === 0) continue;
      const scale = (
        candidateX * (rightQuery.x - leftQuery.x)
        + candidateY * (rightQuery.y - leftQuery.y)
      ) / denominator;
      const scalePermille = Math.round(scale * 1000);
      if (scalePermille < minimumScalePermille || scalePermille > maximumScalePermille) continue;
      models.push({
        scale,
        translationX: leftQuery.x - scale * leftCandidate.x,
        translationY: leftQuery.y - scale * leftCandidate.y,
      });
    }
  }
  const evaluated = models.map((model) => ({
    model,
    inliers: inliersForModel(tentative, query.keypoints, candidate.keypoints, model, maximumResidual),
  })).sort((left, right) => compareInlierSets(left.inliers, right.inliers));
  const selected = evaluated[0] ?? { model: null, inliers: [] };
  const inlierRatio = tentative.length === 0 ? 0 : selected.inliers.length / tentative.length;
  const verification = verifyTransformedOverlap(query, candidate, selected.model);
  return {
    queryKeypoints: query.keypoints.length,
    candidateKeypoints: candidate.keypoints.length,
    tentativeMatches: tentative,
    inliers: selected.inliers,
    inlierRatio,
    transform: selected.model,
    verificationMeanColorDistance: verification.meanColorDistance,
    verificationSamples: verification.samples,
    matches: selected.inliers.length >= minimumInliers
      && inlierRatio >= minimumInlierRatio
      && verification.samples >= minimumVerificationSamples
      && verification.meanColorDistance !== null
      && verification.meanColorDistance <= maximumVerificationColorDistance,
  };
};
