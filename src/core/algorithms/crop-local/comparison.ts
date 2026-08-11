import type {
  CropLocalExperimentFingerprint,
  CropLocalFeature,
  CropLocalVerificationSketch,
} from './fingerprint';
import { validateCropLocalExperimentFingerprint } from './fingerprint';

export interface CropLocalComparisonOptions {
  readonly maximumDescriptorDistance?: number;
  readonly ratioPermille?: number;
  readonly minimumInliers?: number;
  readonly minimumInlierRatio?: number;
  readonly minimumSpatialZones?: number;
  readonly maximumResidualPermille?: number;
  readonly minimumInformativeCoverage?: number;
  readonly denseInformationCutoff?: number;
  readonly denseMinimumAgreement?: number;
  readonly denseMaximumContradiction?: number;
  readonly sparseMinimumAgreement?: number;
  readonly sparseMaximumContradiction?: number;
  readonly minimumInformativeZones?: number;
}

export interface CropLocalTransform {
  readonly scale: number;
  readonly translationX: number;
  readonly translationY: number;
}

export interface CropLocalTentativeMatch {
  readonly queryIndex: number;
  readonly candidateIndex: number;
  readonly distance: number;
  readonly secondDistance: number;
  readonly weight: number;
}

export interface CropLocalModelEvidence {
  readonly transform: CropLocalTransform;
  readonly inliers: number;
  readonly inlierRatio: number;
  readonly weightedSupport: number;
  readonly queryZones: number;
  readonly candidateZones: number;
  readonly meanResidual: number;
}

export interface CropLocalVerificationEvidence {
  readonly verifiedSamples: number;
  readonly informativeCoverage: number;
  readonly agreementScore: number;
  readonly contradictionScore: number;
  readonly informativeZones: number;
}

export type CropLocalComparisonStatus = 'match' | 'no-match' | 'insufficient-evidence';

export type CropLocalComparisonReason = (
  | 'too-few-candidate-matches'
  | 'no-consistent-crop-transform'
  | 'insufficient-distinctive-overlap'
  | 'aligned-content-disagrees'
  | 'strong-aligned-contradictions'
  | 'sparse-aligned-content-disagrees'
  | 'sparse-aligned-contradictions'
  | 'multiscale-geometry-and-content-agree'
);

export interface CropLocalComparisonEvidence {
  /**
   * `match` means the crop is visually consistent with part of the source. It is not proof that
   * two template-based images represent the same item.
   */
  readonly status: CropLocalComparisonStatus;
  readonly direction: 'source-to-crop';
  readonly sourceFeatures: number;
  readonly cropFeatures: number;
  readonly candidateMatches: number;
  readonly geometricInliers: number;
  readonly weightedInlierScore: number;
  readonly spatialCoverage: number;
  readonly transform: CropLocalTransform | null;
  readonly retainedModels: readonly CropLocalModelEvidence[];
  readonly verification: CropLocalVerificationEvidence;
  readonly reasons: readonly CropLocalComparisonReason[];
}

const POPCOUNT = Uint8Array.of(0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4);
const WORD_CACHE = new WeakMap<CropLocalFeature, Uint32Array>();

interface DecodedSketch {
  readonly luminance: Uint8Array;
}

const SKETCH_CACHE = new WeakMap<CropLocalVerificationSketch, DecodedSketch>();

const words = (feature: CropLocalFeature): Uint32Array => {
  const cached = WORD_CACHE.get(feature);
  if (cached !== undefined) return cached;
  const output = new Uint32Array(8);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(feature.descriptor.slice(index * 8, index * 8 + 8), 16);
  }
  WORD_CACHE.set(feature, output);
  return output;
};

const popcount32 = (input: number): number => {
  let value = input - ((input >>> 1) & 0x5555_5555);
  value = (value & 0x3333_3333) + ((value >>> 2) & 0x3333_3333);
  return (((value + (value >>> 4)) & 0x0f0f_0f0f) * 0x0101_0101) >>> 24;
};

const distance = (left: CropLocalFeature, right: CropLocalFeature): number => {
  const leftWords = words(left);
  const rightWords = words(right);
  let output = 0;
  for (let index = 0; index < leftWords.length; index += 1) {
    output += popcount32(leftWords[index] ^ rightWords[index]);
  }
  return output;
};

const repetitionCounts = (features: readonly CropLocalFeature[]): Uint16Array => {
  const output = new Uint16Array(features.length);
  output.fill(1);
  for (let left = 0; left < features.length; left += 1) {
    for (let right = left + 1; right < features.length; right += 1) {
      if (distance(features[left], features[right]) <= 12) {
        output[left] += 1;
        output[right] += 1;
      }
    }
  }
  return output;
};

const nearestTwo = (
  source: CropLocalFeature,
  targets: readonly CropLocalFeature[],
): readonly [number, number, number] => {
  let bestIndex = -1;
  let best = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;
  targets.forEach((target, index) => {
    const value = distance(source, target);
    if (value < best) {
      second = best;
      best = value;
      bestIndex = index;
    } else if (value < second) {
      second = value;
    }
  });
  return [bestIndex, best, second];
};

const candidateMatches = (
  query: readonly CropLocalFeature[],
  candidate: readonly CropLocalFeature[],
  maximumDistance: number,
  ratioPermille: number,
): CropLocalTentativeMatch[] => {
  if (query.length === 0 || candidate.length < 2) return [];
  const queryRepetition = repetitionCounts(query);
  const candidateRepetition = repetitionCounts(candidate);
  const reverse = candidate.map((feature) => nearestTwo(feature, query)[0]);
  return query.flatMap((feature, queryIndex) => {
    const [candidateIndex, best, second] = nearestTwo(feature, candidate);
    if (
      candidateIndex < 0
      || best > maximumDistance
      || !Number.isFinite(second)
      || second === 0
      || best * 1000 > second * ratioPermille
      || reverse[candidateIndex] !== queryIndex
    ) return [];
    return [{
      queryIndex,
      candidateIndex,
      distance: best,
      secondDistance: second,
      weight: 1 / Math.sqrt(queryRepetition[queryIndex] * candidateRepetition[candidateIndex]),
    }];
  });
};

const spatialZones = (
  points: readonly { readonly x: number; readonly y: number }[],
  width: number,
  height: number,
): number => new Set(points.map(({ x, y }) => (
  `${Math.min(3, Math.floor(x * 4 / width))}:${Math.min(3, Math.floor(y * 4 / height))}`
))).size;

const refine = (
  matches: readonly CropLocalTentativeMatch[],
  query: readonly CropLocalFeature[],
  candidate: readonly CropLocalFeature[],
): CropLocalTransform | null => {
  let totalWeight = 0;
  let queryMeanX = 0;
  let queryMeanY = 0;
  let candidateMeanX = 0;
  let candidateMeanY = 0;
  matches.forEach((match) => {
    totalWeight += match.weight;
    queryMeanX += query[match.queryIndex].x * match.weight;
    queryMeanY += query[match.queryIndex].y * match.weight;
    candidateMeanX += candidate[match.candidateIndex].x * match.weight;
    candidateMeanY += candidate[match.candidateIndex].y * match.weight;
  });
  if (totalWeight === 0) return null;
  queryMeanX /= totalWeight;
  queryMeanY /= totalWeight;
  candidateMeanX /= totalWeight;
  candidateMeanY /= totalWeight;
  let numerator = 0;
  let denominator = 0;
  matches.forEach((match) => {
    const queryFeature = query[match.queryIndex];
    const candidateFeature = candidate[match.candidateIndex];
    const candidateX = candidateFeature.x - candidateMeanX;
    const candidateY = candidateFeature.y - candidateMeanY;
    numerator += match.weight * (
      candidateX * (queryFeature.x - queryMeanX)
      + candidateY * (queryFeature.y - queryMeanY)
    );
    denominator += match.weight * (candidateX ** 2 + candidateY ** 2);
  });
  if (denominator <= 1e-9) return null;
  const scale = numerator / denominator;
  if (scale <= 0) return null;
  return {
    scale,
    translationX: queryMeanX - scale * candidateMeanX,
    translationY: queryMeanY - scale * candidateMeanY,
  };
};

const inliers = (
  matches: readonly CropLocalTentativeMatch[],
  query: readonly CropLocalFeature[],
  candidate: readonly CropLocalFeature[],
  transform: CropLocalTransform,
  maximumResidual: number,
): CropLocalTentativeMatch[] => matches.filter((match) => {
  const queryFeature = query[match.queryIndex];
  const candidateFeature = candidate[match.candidateIndex];
  const differenceX = queryFeature.x - (
    transform.scale * candidateFeature.x + transform.translationX
  );
  const differenceY = queryFeature.y - (
    transform.scale * candidateFeature.y + transform.translationY
  );
  return differenceX ** 2 + differenceY ** 2 <= maximumResidual ** 2;
});

const models = (
  tentative: readonly CropLocalTentativeMatch[],
  query: CropLocalExperimentFingerprint,
  candidate: CropLocalExperimentFingerprint,
  residualPermille: number,
): CropLocalModelEvidence[] => {
  if (tentative.length < 2) return [];
  const ranked = [...tentative].sort((left, right) => (
    left.distance / left.secondDistance - right.distance / right.secondDistance
    || left.distance - right.distance
    || left.queryIndex - right.queryIndex
  )).slice(0, 64);
  const residual = Math.max(3, Math.max(query.sourceWidth, query.sourceHeight) * residualPermille / 1000);
  const bins = new Map<string, { vote: number; scale: number; x: number; y: number }>();
  const add = (transform: CropLocalTransform, vote: number) => {
    if (transform.scale < 0.2 || transform.scale > 5) return;
    const key = `${Math.round(Math.log(transform.scale) / 0.025)}:${Math.round(transform.translationX / residual)}:${Math.round(transform.translationY / residual)}`;
    const aggregate = bins.get(key) ?? { vote: 0, scale: 0, x: 0, y: 0 };
    aggregate.vote += vote;
    aggregate.scale += transform.scale * vote;
    aggregate.x += transform.translationX * vote;
    aggregate.y += transform.translationY * vote;
    bins.set(key, aggregate);
  };
  ranked.forEach((match) => {
    const queryFeature = query.features[match.queryIndex];
    const candidateFeature = candidate.features[match.candidateIndex];
    const scale = queryFeature.scalePermille / candidateFeature.scalePermille;
    add({
      scale,
      translationX: queryFeature.x - scale * candidateFeature.x,
      translationY: queryFeature.y - scale * candidateFeature.y,
    }, match.weight);
  });
  for (let left = 0; left < ranked.length; left += 1) {
    for (let right = left + 1; right < ranked.length; right += 1) {
      const leftQuery = query.features[ranked[left].queryIndex];
      const rightQuery = query.features[ranked[right].queryIndex];
      const leftCandidate = candidate.features[ranked[left].candidateIndex];
      const rightCandidate = candidate.features[ranked[right].candidateIndex];
      const candidateX = rightCandidate.x - leftCandidate.x;
      const candidateY = rightCandidate.y - leftCandidate.y;
      const denominator = candidateX ** 2 + candidateY ** 2;
      if (denominator <= residual ** 2) continue;
      const scale = (
        candidateX * (rightQuery.x - leftQuery.x)
        + candidateY * (rightQuery.y - leftQuery.y)
      ) / denominator;
      add({
        scale,
        translationX: leftQuery.x - scale * leftCandidate.x,
        translationY: leftQuery.y - scale * leftCandidate.y,
      }, Math.min(ranked[left].weight, ranked[right].weight));
    }
  }
  const hypotheses = [...bins.entries()].sort((left, right) => (
    right[1].vote - left[1].vote || left[0].localeCompare(right[0])
  )).slice(0, 32).map(([, aggregate]) => ({
    scale: aggregate.scale / aggregate.vote,
    translationX: aggregate.x / aggregate.vote,
    translationY: aggregate.y / aggregate.vote,
  }));
  const evaluated = hypotheses.flatMap((initial) => {
    let transform = initial;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const selected = inliers(ranked, query.features, candidate.features, transform, residual);
      if (selected.length < 2) break;
      const refined = refine(selected, query.features, candidate.features);
      if (refined === null) break;
      transform = refined;
    }
    const selected = inliers(ranked, query.features, candidate.features, transform, residual);
    if (selected.length < 2) return [];
    const weightedSupport = selected.reduce((total, match) => total + match.weight, 0);
    const queryPoints = selected.map((match) => query.features[match.queryIndex]);
    const candidatePoints = selected.map((match) => candidate.features[match.candidateIndex]);
    const meanResidual = selected.reduce((total, match) => {
      const queryFeature = query.features[match.queryIndex];
      const candidateFeature = candidate.features[match.candidateIndex];
      return total + Math.hypot(
        queryFeature.x - (transform.scale * candidateFeature.x + transform.translationX),
        queryFeature.y - (transform.scale * candidateFeature.y + transform.translationY),
      );
    }, 0) / selected.length;
    return [{
      transform,
      inliers: selected.length,
      inlierRatio: selected.length / ranked.length,
      weightedSupport,
      queryZones: spatialZones(queryPoints, query.sourceWidth, query.sourceHeight),
      candidateZones: spatialZones(candidatePoints, candidate.sourceWidth, candidate.sourceHeight),
      meanResidual,
    }];
  });
  const ordered = evaluated.sort((left, right) => (
    right.weightedSupport - left.weightedSupport
    || right.inliers - left.inliers
    || Math.min(right.queryZones, right.candidateZones) - Math.min(left.queryZones, left.candidateZones)
    || left.meanResidual - right.meanResidual
  ));
  const distinct: CropLocalModelEvidence[] = [];
  for (const model of ordered) {
    if (distinct.some((retained) => (
      Math.abs(retained.transform.scale - model.transform.scale) <= 0.0001
      && Math.abs(retained.transform.translationX - model.transform.translationX) <= 0.1
      && Math.abs(retained.transform.translationY - model.transform.translationY) <= 0.1
    ))) continue;
    distinct.push(model);
    if (distinct.length >= 8) break;
  }
  return distinct;
};

const hexBytes = (value: string): Uint8Array => {
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
};

const decodedSketch = (sketch: CropLocalVerificationSketch): DecodedSketch => {
  const cached = SKETCH_CACHE.get(sketch);
  if (cached !== undefined) return cached;
  const decoded = {
    luminance: hexBytes(sketch.luminance),
  };
  SKETCH_CACHE.set(sketch, decoded);
  return decoded;
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

interface VerificationPlanes {
  readonly local: Int16Array;
  readonly gradient: Uint16Array;
  readonly census: Uint8Array;
}

const blur = (input: Uint8Array, width: number, height: number): Uint8Array => {
  const output = new Uint8Array(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const sampleY = Math.max(0, Math.min(height - 1, y + offsetY));
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.max(0, Math.min(width - 1, x + offsetX));
          sum += input[sampleY * width + sampleX];
        }
      }
      output[y * width + x] = Math.floor((sum + 4) / 9);
    }
  }
  return output;
};

const verificationPlanes = (
  luminance: Uint8Array,
  width: number,
  height: number,
): VerificationPlanes => {
  const mean = blur(blur(luminance, width, height), width, height);
  const local = new Int16Array(luminance.length);
  const gradient = new Uint16Array(luminance.length);
  const census = new Uint8Array(luminance.length);
  const offsets = [
    [-1, -1], [0, -1], [1, -1], [1, 0],
    [1, 1], [0, 1], [-1, 1], [-1, 0],
  ] as const;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      local[index] = luminance[index] - mean[index];
      const left = luminance[y * width + Math.max(0, x - 1)];
      const right = luminance[y * width + Math.min(width - 1, x + 1)];
      const top = luminance[Math.max(0, y - 1) * width + x];
      const bottom = luminance[Math.min(height - 1, y + 1) * width + x];
      gradient[index] = Math.abs(right - left) + Math.abs(bottom - top);
      offsets.forEach(([offsetX, offsetY], bit) => {
        const sampleX = Math.max(0, Math.min(width - 1, x + offsetX));
        const sampleY = Math.max(0, Math.min(height - 1, y + offsetY));
        if (luminance[sampleY * width + sampleX] < luminance[index]) census[index] |= 1 << bit;
      });
    }
  }
  return { local, gradient, census };
};

const verify = (
  query: CropLocalExperimentFingerprint,
  candidate: CropLocalExperimentFingerprint,
  transform: CropLocalTransform,
): CropLocalVerificationEvidence => {
  const querySketch = decodedSketch(query.verification);
  const candidateSketch = decodedSketch(candidate.verification);
  const width = query.verification.width;
  const height = query.verification.height;
  const warped = new Uint8Array(width * height);
  const valid = new Uint8Array(width * height);
  for (let queryY = 0; queryY < height; queryY += 1) {
    const querySourceY = (queryY + 0.5) * query.sourceHeight / height;
    const candidateSourceY = (querySourceY - transform.translationY) / transform.scale;
    if (candidateSourceY < 0 || candidateSourceY >= candidate.sourceHeight) continue;
    const candidateY = candidateSourceY * candidate.verification.height / candidate.sourceHeight - 0.5;
    for (let queryX = 0; queryX < width; queryX += 1) {
      const querySourceX = (queryX + 0.5) * query.sourceWidth / width;
      const candidateSourceX = (querySourceX - transform.translationX) / transform.scale;
      if (candidateSourceX < 0 || candidateSourceX >= candidate.sourceWidth) continue;
      const candidateX = candidateSourceX * candidate.verification.width / candidate.sourceWidth - 0.5;
      const index = queryY * width + queryX;
      warped[index] = Math.round(bilinear(
        candidateSketch.luminance,
        candidate.verification.width,
        candidate.verification.height,
        candidateX,
        candidateY,
      ));
      valid[index] = 1;
    }
  }
  const queryPlanes = verificationPlanes(querySketch.luminance, width, height);
  const candidatePlanes = verificationPlanes(warped, width, height);
  let verifiedSamples = 0;
  let informativeSamples = 0;
  let agreements = 0;
  let contradictions = 0;
  const zones = new Set<string>();
  for (let queryY = 2; queryY < height - 2; queryY += 1) {
    for (let queryX = 2; queryX < width - 2; queryX += 1) {
      const index = queryY * width + queryX;
      let neighborhoodValid = true;
      for (let offsetY = -2; offsetY <= 2 && neighborhoodValid; offsetY += 1) {
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          if (valid[(queryY + offsetY) * width + queryX + offsetX] === 0) {
            neighborhoodValid = false;
            break;
          }
        }
      }
      if (!neighborhoodValid) continue;
      verifiedSamples += 1;
      if (candidatePlanes.gradient[index] < 16 && queryPlanes.gradient[index] < 16) continue;
      informativeSamples += 1;
      const localDifference = Math.abs(candidatePlanes.local[index] - queryPlanes.local[index]);
      const censusDifference = candidatePlanes.census[index] ^ queryPlanes.census[index];
      const censusDistance = POPCOUNT[censusDifference & 15] + POPCOUNT[censusDifference >>> 4];
      if (localDifference <= 12 || censusDistance <= 2) agreements += 1;
      if (localDifference >= 24 && censusDistance >= 4) contradictions += 1;
      zones.add(`${Math.min(3, Math.floor(queryX * 4 / width))}:${Math.min(3, Math.floor(queryY * 4 / height))}`);
    }
  }
  return {
    verifiedSamples,
    informativeCoverage: verifiedSamples === 0 ? 0 : informativeSamples / verifiedSamples,
    agreementScore: informativeSamples === 0 ? 0 : agreements / informativeSamples,
    contradictionScore: informativeSamples === 0 ? 0 : contradictions / informativeSamples,
    informativeZones: zones.size,
  };
};

const validateRatio = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be from 0 through 1`);
  }
};

/** @internal Directional source-to-crop matching with bounded inputs and tri-state evidence. */
export const compareCropLocalSourceToCrop = (
  source: CropLocalExperimentFingerprint,
  crop: CropLocalExperimentFingerprint,
  options: CropLocalComparisonOptions = {},
): CropLocalComparisonEvidence => {
  validateCropLocalExperimentFingerprint(source);
  validateCropLocalExperimentFingerprint(crop);
  const query = source;
  const candidate = crop;
  const maximumDescriptorDistance = options.maximumDescriptorDistance ?? 48;
  const ratioPermille = options.ratioPermille ?? 700;
  const minimumInliers = options.minimumInliers ?? 4;
  const minimumInlierRatio = options.minimumInlierRatio ?? 0.5;
  const minimumSpatialZones = options.minimumSpatialZones ?? 4;
  const maximumResidualPermille = options.maximumResidualPermille ?? 6;
  const minimumInformativeCoverage = options.minimumInformativeCoverage ?? 0.02;
  const denseInformationCutoff = options.denseInformationCutoff ?? 0.4;
  const denseMinimumAgreement = options.denseMinimumAgreement ?? 0.65;
  const denseMaximumContradiction = options.denseMaximumContradiction ?? 0.2;
  const sparseMinimumAgreement = options.sparseMinimumAgreement ?? 0.8;
  const sparseMaximumContradiction = options.sparseMaximumContradiction ?? 0;
  const minimumInformativeZones = options.minimumInformativeZones ?? 3;
  for (const [value, minimum, maximum, name] of [
    [maximumDescriptorDistance, 0, 256, 'maximum descriptor distance'],
    [ratioPermille, 1, 1000, 'ratio permille'],
    [minimumInliers, 2, 1024, 'minimum inliers'],
    [minimumSpatialZones, 1, 16, 'minimum spatial zones'],
    [maximumResidualPermille, 1, 100, 'maximum residual permille'],
    [minimumInformativeZones, 1, 16, 'minimum informative zones'],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
    }
  }
  validateRatio(minimumInlierRatio, 'minimum inlier ratio');
  validateRatio(minimumInformativeCoverage, 'minimum informative coverage');
  validateRatio(denseInformationCutoff, 'dense information cutoff');
  validateRatio(denseMinimumAgreement, 'dense minimum agreement');
  validateRatio(denseMaximumContradiction, 'dense maximum contradiction');
  validateRatio(sparseMinimumAgreement, 'sparse minimum agreement');
  validateRatio(sparseMaximumContradiction, 'sparse maximum contradiction');
  const tentative = candidateMatches(
    query.features, candidate.features, maximumDescriptorDistance, ratioPermille,
  );
  const retainedModels = models(tentative, query, candidate, maximumResidualPermille);
  const plausible = retainedModels.filter((model) => (
    model.inliers >= minimumInliers
    && model.inlierRatio >= minimumInlierRatio
    && Math.min(model.queryZones, model.candidateZones) >= minimumSpatialZones
  ));
  const verified = plausible.map((model) => ({ model, verification: verify(query, candidate, model.transform) }));
  verified.sort((left, right) => (
    (right.verification.agreementScore - 2 * right.verification.contradictionScore)
      - (left.verification.agreementScore - 2 * left.verification.contradictionScore)
    || right.verification.agreementScore - left.verification.agreementScore
    || left.verification.contradictionScore - right.verification.contradictionScore
    || right.model.weightedSupport - left.model.weightedSupport
  ));
  const selected = verified[0] ?? null;
  const emptyVerification: CropLocalVerificationEvidence = {
    verifiedSamples: 0,
    informativeCoverage: 0,
    agreementScore: 0,
    contradictionScore: 0,
    informativeZones: 0,
  };
  const verification = selected?.verification ?? emptyVerification;
  const reasons: CropLocalComparisonReason[] = [];
  let status: CropLocalComparisonEvidence['status'] = 'no-match';
  if (tentative.length < minimumInliers) reasons.push('too-few-candidate-matches');
  else if (plausible.length === 0) reasons.push('no-consistent-crop-transform');
  else if (
    verification.informativeCoverage < minimumInformativeCoverage
    || verification.informativeZones < minimumInformativeZones
  ) {
    status = 'insufficient-evidence';
    reasons.push('insufficient-distinctive-overlap');
  } else if (
    verification.informativeCoverage >= denseInformationCutoff
    && verification.agreementScore < denseMinimumAgreement
  ) {
    reasons.push('aligned-content-disagrees');
  } else if (
    verification.informativeCoverage >= denseInformationCutoff
    && verification.contradictionScore > denseMaximumContradiction
  ) {
    reasons.push('strong-aligned-contradictions');
  } else if (
    verification.informativeCoverage < denseInformationCutoff
    && verification.agreementScore < sparseMinimumAgreement
  ) {
    reasons.push('sparse-aligned-content-disagrees');
  } else if (
    verification.informativeCoverage < denseInformationCutoff
    && verification.contradictionScore > sparseMaximumContradiction
  ) {
    reasons.push('sparse-aligned-contradictions');
  } else {
    status = 'match';
    reasons.push('multiscale-geometry-and-content-agree');
  }
  return {
    status,
    direction: 'source-to-crop',
    sourceFeatures: query.features.length,
    cropFeatures: candidate.features.length,
    candidateMatches: tentative.length,
    geometricInliers: selected?.model.inliers ?? retainedModels[0]?.inliers ?? 0,
    weightedInlierScore: selected?.model.weightedSupport ?? retainedModels[0]?.weightedSupport ?? 0,
    spatialCoverage: selected === null
      ? 0 : Math.min(selected.model.queryZones, selected.model.candidateZones) / 16,
    transform: selected?.model.transform ?? null,
    retainedModels,
    verification,
    reasons,
  };
};

/** @internal Compatibility alias retained while benchmark callers migrate to explicit roles. */
export const compareCropLocalFingerprints = compareCropLocalSourceToCrop;
