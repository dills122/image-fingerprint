import type {
  BlockHashFingerprint,
  ImageFingerprint,
  PdqFingerprint,
} from './types';

type FingerprintRecord = Record<string, unknown>;

const PDQ_KEYS = [
  'schemaVersion',
  'algorithm',
  'encoding',
  'hash',
  'bitLength',
  'quality',
] as const;

const BLOCK_HASH_KEYS = [
  'schemaVersion',
  'algorithm',
  'encoding',
  'hash',
  'bitLength',
  'parameters',
] as const;

const BLOCK_HASH_PARAMETER_KEYS = [
  'bitsPerSide',
  'method',
] as const;

const isRecord = (value: unknown): value is FingerprintRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const assertRecord = (value: unknown, subject: string): FingerprintRecord => {
  if (!isRecord(value)) {
    throw new TypeError(`${subject} must be an object`);
  }

  return value;
};

const assertExactKeys = (
  record: FingerprintRecord,
  expectedKeys: readonly string[],
  subject: string,
): void => {
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== expectedKeys.length
    || expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))
  ) {
    throw new TypeError(`${subject} contains missing or unknown fields`);
  }
};

const assertFixedFields = (record: FingerprintRecord): void => {
  if (record.schemaVersion !== 1) {
    throw new RangeError('schemaVersion must be 1');
  }
  if (record.encoding !== 'hex') {
    throw new RangeError('encoding must be hex');
  }
};

const normalizeHex = (value: unknown, expectedLength: number): string => {
  if (
    typeof value !== 'string'
    || value.length !== expectedLength
    || !/^[0-9a-fA-F]+$/.test(value)
  ) {
    throw new RangeError(`hash must be exactly ${expectedLength} hexadecimal characters`);
  }

  return value.toLowerCase();
};

const normalizePdqFingerprint = (record: FingerprintRecord): PdqFingerprint => {
  assertExactKeys(record, PDQ_KEYS, 'PDQ fingerprint');
  assertFixedFields(record);

  if (record.bitLength !== 256) {
    throw new RangeError('pdq-v1 bitLength must be 256');
  }
  const { quality } = record;
  if (typeof quality !== 'number' || !Number.isInteger(quality) || quality < 0 || quality > 100) {
    throw new RangeError('pdq-v1 quality must be an integer from 0 through 100');
  }

  return {
    schemaVersion: 1,
    algorithm: 'pdq-v1',
    encoding: 'hex',
    hash: normalizeHex(record.hash, 64),
    bitLength: 256,
    quality,
  };
};

const normalizeBlockHashFingerprint = (
  record: FingerprintRecord,
): BlockHashFingerprint => {
  assertExactKeys(record, BLOCK_HASH_KEYS, 'BlockHash fingerprint');
  assertFixedFields(record);

  const parameters = assertRecord(record.parameters, 'BlockHash parameters');
  assertExactKeys(parameters, BLOCK_HASH_PARAMETER_KEYS, 'BlockHash parameters');

  const { bitsPerSide, method } = parameters;
  if (
    typeof bitsPerSide !== 'number'
    || !Number.isSafeInteger(bitsPerSide)
    || bitsPerSide <= 0
    || bitsPerSide % 2 !== 0
  ) {
    throw new RangeError('bitsPerSide must be a positive even safe integer');
  }
  if (method !== 1 && method !== 2) {
    throw new RangeError('BlockHash method must be 1 or 2');
  }

  const bitLength = bitsPerSide ** 2;
  if (!Number.isSafeInteger(bitLength)) {
    throw new RangeError('derived BlockHash bitLength must be a safe integer');
  }
  if (record.bitLength !== bitLength) {
    throw new RangeError('BlockHash bitLength must equal bitsPerSide squared');
  }

  return {
    schemaVersion: 1,
    algorithm: 'blockhash-v1',
    encoding: 'hex',
    hash: normalizeHex(record.hash, bitLength / 4),
    bitLength,
    parameters: {
      bitsPerSide,
      method,
    },
  };
};

const normalizeFingerprint = (value: unknown): ImageFingerprint => {
  const record = assertRecord(value, 'fingerprint');

  if (record.algorithm === 'pdq-v1') {
    return normalizePdqFingerprint(record);
  }
  if (record.algorithm === 'blockhash-v1') {
    return normalizeBlockHashFingerprint(record);
  }

  throw new RangeError('algorithm must be blockhash-v1 or pdq-v1');
};

/** Parse and validate one schema-versioned fingerprint JSON record. */
export const parseFingerprint = (serialized: string): ImageFingerprint => {
  if (typeof serialized !== 'string') {
    throw new TypeError('serialized fingerprint must be a string');
  }

  return normalizeFingerprint(JSON.parse(serialized) as unknown);
};

/** Validate and serialize one fingerprint using the canonical schema-v1 field order. */
export const serializeFingerprint = (fingerprint: ImageFingerprint): string => (
  JSON.stringify(normalizeFingerprint(fingerprint))
);
