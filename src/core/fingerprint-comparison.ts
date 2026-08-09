import type {
  BlockHashFingerprint,
  FingerprintComparison,
  ImageFingerprint,
  PdqFingerprint,
  PdqFingerprintComparison,
  PdqMatchPolicy,
  PdqMatchResult,
} from './types';

const POPCOUNT_NIBBLE = Uint8Array.of(
  0, 1, 1, 2,
  1, 2, 2, 3,
  1, 2, 2, 3,
  2, 3, 3, 4,
);

const assertFingerprintHeader = (fingerprint: ImageFingerprint): void => {
  if (typeof fingerprint !== 'object' || fingerprint === null || Array.isArray(fingerprint)) {
    throw new TypeError('fingerprint must be an object');
  }
  if (fingerprint.schemaVersion !== 1) {
    throw new RangeError('schemaVersion must be 1');
  }
  if (fingerprint.encoding !== 'hex') {
    throw new RangeError('encoding must be hex');
  }
  if (fingerprint.algorithm !== 'blockhash-v1' && fingerprint.algorithm !== 'pdq-v1') {
    throw new RangeError('algorithm must be blockhash-v1 or pdq-v1');
  }
};

const assertBlockHashParameters = (fingerprint: BlockHashFingerprint): void => {
  const { parameters } = fingerprint;
  if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
    throw new TypeError('BlockHash parameters must be an object');
  }
  if (
    typeof parameters.bitsPerSide !== 'number'
    || !Number.isSafeInteger(parameters.bitsPerSide)
    || parameters.bitsPerSide <= 0
    || parameters.bitsPerSide % 2 !== 0
  ) {
    throw new RangeError('bitsPerSide must be a positive even safe integer');
  }
  if (parameters.method !== 1 && parameters.method !== 2) {
    throw new RangeError('BlockHash method must be 1 or 2');
  }
};

const assertPdqQuality = (fingerprint: PdqFingerprint): void => {
  if (
    typeof fingerprint.quality !== 'number'
    || !Number.isInteger(fingerprint.quality)
    || fingerprint.quality < 0
    || fingerprint.quality > 100
  ) {
    throw new RangeError('PDQ quality must be an integer from 0 through 100');
  }
};

const assertInternallyConsistentBitLength = (fingerprint: ImageFingerprint): void => {
  const expectedBitLength = fingerprint.algorithm === 'pdq-v1'
    ? 256
    : fingerprint.parameters.bitsPerSide ** 2;
  if (fingerprint.bitLength !== expectedBitLength) {
    throw new RangeError('fingerprint bitLength is inconsistent with its algorithm parameters');
  }
};

const assertHash = (hash: string, bitLength: number): void => {
  if (
    !Number.isSafeInteger(bitLength)
    || bitLength <= 0
    || bitLength % 4 !== 0
  ) {
    throw new RangeError('bitLength must be a positive safe integer divisible by 4');
  }

  const expectedLength = bitLength / 4;
  if (
    typeof hash !== 'string'
    || hash.length !== expectedLength
    || !/^[0-9a-fA-F]+$/.test(hash)
  ) {
    throw new RangeError(`hash must be exactly ${expectedLength} hexadecimal characters`);
  }
};

const hammingDistanceHex = (
  left: string,
  right: string,
  bitLength: number,
): number => {
  assertHash(left, bitLength);
  assertHash(right, bitLength);

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftNibble = Number.parseInt(left[index], 16);
    const rightNibble = Number.parseInt(right[index], 16);
    distance += POPCOUNT_NIBBLE[leftNibble ^ rightNibble];
  }

  return distance;
};

export const compareFingerprints = (
  left: ImageFingerprint,
  right: ImageFingerprint,
): FingerprintComparison => {
  assertFingerprintHeader(left);
  assertFingerprintHeader(right);

  if (left.algorithm !== right.algorithm) {
    return { comparable: false, reason: 'algorithm-mismatch' };
  }

  if (left.algorithm === 'blockhash-v1' && right.algorithm === 'blockhash-v1') {
    assertBlockHashParameters(left);
    assertBlockHashParameters(right);
    if (
      left.parameters.bitsPerSide !== right.parameters.bitsPerSide
      || left.parameters.method !== right.parameters.method
    ) {
      return { comparable: false, reason: 'parameter-mismatch' };
    }
  } else if (left.algorithm === 'pdq-v1' && right.algorithm === 'pdq-v1') {
    assertPdqQuality(left);
    assertPdqQuality(right);
  }

  if (left.bitLength !== right.bitLength) {
    return { comparable: false, reason: 'bit-length-mismatch' };
  }

  assertInternallyConsistentBitLength(left);
  assertInternallyConsistentBitLength(right);

  const distance = hammingDistanceHex(left.hash, right.hash, left.bitLength);
  return {
    comparable: true,
    algorithm: left.algorithm,
    distance,
    bitLength: left.bitLength,
    normalizedDistance: distance / left.bitLength,
  };
};

export const PDQ_STARTING_POLICY = Object.freeze({
  maxDistance: 31,
  minQuality: 50,
} as const satisfies PdqMatchPolicy);

const assertPolicy = (policy: PdqMatchPolicy): void => {
  if (
    typeof policy !== 'object'
    || policy === null
    || !Number.isInteger(policy.maxDistance)
    || policy.maxDistance < 0
    || policy.maxDistance > 256
  ) {
    throw new RangeError('maxDistance must be an integer from 0 through 256');
  }
  if (
    !Number.isInteger(policy.minQuality)
    || policy.minQuality < 0
    || policy.minQuality > 100
  ) {
    throw new RangeError('minQuality must be an integer from 0 through 100');
  }
};

const assertPdqFingerprint = (fingerprint: PdqFingerprint): void => {
  assertFingerprintHeader(fingerprint);
  if (fingerprint.algorithm !== 'pdq-v1') {
    throw new TypeError('PDQ match policy requires pdq-v1 fingerprints');
  }
  assertPdqQuality(fingerprint);
};

export const evaluatePdqMatch = (
  left: PdqFingerprint,
  right: PdqFingerprint,
  policy: PdqMatchPolicy,
): PdqMatchResult => {
  assertPolicy(policy);
  assertPdqFingerprint(left);
  assertPdqFingerprint(right);

  const comparison = compareFingerprints(left, right);
  if (
    !comparison.comparable
    || comparison.algorithm !== 'pdq-v1'
    || comparison.bitLength !== 256
  ) {
    throw new TypeError('PDQ match policy requires compatible 256-bit fingerprints');
  }

  const pdqComparison: PdqFingerprintComparison = {
    ...comparison,
    algorithm: 'pdq-v1',
    bitLength: 256,
  };

  if (left.quality < policy.minQuality || right.quality < policy.minQuality) {
    return {
      eligible: false,
      matches: false,
      reason: 'quality-below-minimum',
      comparison: pdqComparison,
    };
  }

  return {
    eligible: true,
    matches: comparison.distance <= policy.maxDistance,
    comparison: pdqComparison,
  };
};
