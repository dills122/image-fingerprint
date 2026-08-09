const MATCH_SCOPES = new Set(['full-image', 'crop-region']);
const EXPECTED_RELATIONSHIPS = new Set(['match', 'non-match']);

const assertIntegerInRange = (value, field, minimum, maximum) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field} must be an integer from ${minimum} through ${maximum}`);
  }
};

const assertPolicy = (policy) => {
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    throw new TypeError('policy must be an object');
  }
  assertIntegerInRange(policy.maxDistance, 'maxDistance', 0, 256);
  assertIntegerInRange(policy.minQuality, 'minQuality', 0, 100);
};

const assertMeasuredPair = (pair, index) => {
  if (typeof pair !== 'object' || pair === null || Array.isArray(pair)) {
    throw new TypeError(`pair ${index} must be an object`);
  }
  if (typeof pair.id !== 'string' || pair.id.length === 0) {
    throw new TypeError(`pair ${index} id must be a non-empty string`);
  }
  if (!MATCH_SCOPES.has(pair.scope)) {
    throw new RangeError(`${pair.id} scope must be full-image or crop-region`);
  }
  if (!EXPECTED_RELATIONSHIPS.has(pair.expected)) {
    throw new RangeError(`${pair.id} expected must be match or non-match`);
  }
  assertIntegerInRange(pair.distance, `${pair.id} distance`, 0, 256);
  assertIntegerInRange(pair.leftQuality, `${pair.id} leftQuality`, 0, 100);
  assertIntegerInRange(pair.rightQuality, `${pair.id} rightQuality`, 0, 100);
};

const divideOrNull = (numerator, denominator) => (
  denominator === 0 ? null : numerator / denominator
);

export const evaluateMatchingPolicy = (pairs, policy) => {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new TypeError('pairs must be a non-empty array');
  }
  assertPolicy(policy);

  let eligibleCount = 0;
  let qualityFilteredMatches = 0;
  let qualityFilteredNonMatches = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  for (const [index, pair] of pairs.entries()) {
    assertMeasuredPair(pair, index);
    const expectedMatch = pair.expected === 'match';
    const eligible = pair.leftQuality >= policy.minQuality
      && pair.rightQuality >= policy.minQuality;
    const predictedMatch = eligible && pair.distance <= policy.maxDistance;

    if (eligible) {
      eligibleCount += 1;
    } else if (expectedMatch) {
      qualityFilteredMatches += 1;
    } else {
      qualityFilteredNonMatches += 1;
    }

    if (expectedMatch && predictedMatch) truePositives += 1;
    if (!expectedMatch && predictedMatch) falsePositives += 1;
    if (!expectedMatch && !predictedMatch) trueNegatives += 1;
    if (expectedMatch && !predictedMatch) falseNegatives += 1;
  }

  return {
    policy: {
      maxDistance: policy.maxDistance,
      minQuality: policy.minQuality,
    },
    pairCount: pairs.length,
    eligibleCount,
    ineligibleCount: pairs.length - eligibleCount,
    qualityFilteredMatches,
    qualityFilteredNonMatches,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision: divideOrNull(truePositives, truePositives + falsePositives),
    recall: divideOrNull(truePositives, truePositives + falseNegatives),
    falsePositiveRate: divideOrNull(falsePositives, falsePositives + trueNegatives),
    falseNegativeRate: divideOrNull(falseNegatives, truePositives + falseNegatives),
    accuracy: divideOrNull(truePositives + trueNegatives, pairs.length),
  };
};

const validateSweepAxis = (values, field, minimum, maximum) => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${field} must be a non-empty array`);
  }
  for (const value of values) {
    assertIntegerInRange(value, field, minimum, maximum);
  }
  if (new Set(values).size !== values.length) {
    throw new RangeError(`${field} must not contain duplicate values`);
  }
  return [...values].sort((left, right) => left - right);
};

export const sweepMatchingPolicies = (pairs, axes) => {
  if (typeof axes !== 'object' || axes === null || Array.isArray(axes)) {
    throw new TypeError('sweep axes must be an object');
  }
  const maxDistances = validateSweepAxis(axes.maxDistances, 'maxDistances', 0, 256);
  const minQualities = validateSweepAxis(axes.minQualities, 'minQualities', 0, 100);

  return maxDistances.flatMap(maxDistance => minQualities.map(minQuality => (
    evaluateMatchingPolicy(pairs, { maxDistance, minQuality })
  )));
};
