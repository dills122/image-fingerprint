import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  parseFingerprint,
  serializeFingerprint,
} from '../src/core';
import type { ImageFingerprint } from '../src/core';

const pdqHash = '0123456789abcdef'.repeat(4);

const validPdqRecord = {
  schemaVersion: 1,
  algorithm: 'pdq-v1',
  encoding: 'hex',
  hash: pdqHash,
  bitLength: 256,
  quality: 73,
};

const validBlockHashRecord = {
  schemaVersion: 1,
  algorithm: 'blockhash-v1',
  encoding: 'hex',
  hash: 'abcd',
  bitLength: 16,
  parameters: {
    bitsPerSide: 4,
    method: 2,
  },
};

const parseRecord = (record: unknown): ImageFingerprint => (
  parseFingerprint(JSON.stringify(record))
);

describe('fingerprint record codec', () => {
  it('round-trips a canonical PDQ record', () => {
    const serialized = JSON.stringify(validPdqRecord);

    const parsed = parseFingerprint(serialized);

    expect(parsed).toEqual(validPdqRecord);
    expect(serializeFingerprint(parsed)).toBe(serialized);
  });

  it('accepts uppercase PDQ hex and serializes canonical lowercase JSON', () => {
    const parsed = parseRecord({
      quality: 73,
      hash: pdqHash.toUpperCase(),
      algorithm: 'pdq-v1',
      bitLength: 256,
      encoding: 'hex',
      schemaVersion: 1,
    });

    expect(parsed.hash).toBe(pdqHash);
    expect(serializeFingerprint(parsed)).toBe(JSON.stringify(validPdqRecord));
  });

  it.each([0, 100])('accepts PDQ quality boundary %i', (quality) => {
    expect(parseRecord({
      ...validPdqRecord,
      quality,
    })).toMatchObject({ quality });
  });

  it('round-trips BlockHash records and canonicalizes their hex', () => {
    const parsed = parseRecord({
      ...validBlockHashRecord,
      hash: 'ABCD',
    });

    expect(parsed).toEqual(validBlockHashRecord);
    expect(serializeFingerprint(parsed)).toBe(JSON.stringify(validBlockHashRecord));
  });

  it('accepts BlockHash method 1', () => {
    expect(parseRecord({
      ...validBlockHashRecord,
      parameters: {
        ...validBlockHashRecord.parameters,
        method: 1,
      },
    })).toMatchObject({
      parameters: { method: 1 },
    });
  });

  it.each([
    ['wrong schema', { ...validPdqRecord, schemaVersion: 2 }],
    ['wrong algorithm', { ...validPdqRecord, algorithm: 'pdq-v2' }],
    ['wrong encoding', { ...validPdqRecord, encoding: 'base64' }],
    ['short hash', { ...validPdqRecord, hash: pdqHash.slice(2) }],
    ['non-hex hash', { ...validPdqRecord, hash: `${pdqHash.slice(0, -1)}z` }],
    ['wrong bit length', { ...validPdqRecord, bitLength: 255 }],
    ['fractional quality', { ...validPdqRecord, quality: 73.5 }],
    ['negative quality', { ...validPdqRecord, quality: -1 }],
    ['excessive quality', { ...validPdqRecord, quality: 101 }],
    ['missing quality', {
      schemaVersion: 1,
      algorithm: 'pdq-v1',
      encoding: 'hex',
      hash: pdqHash,
      bitLength: 256,
    }],
    ['unknown field', { ...validPdqRecord, futureField: true }],
  ])('rejects a malformed PDQ record: %s', (_label, record) => {
    expect(() => parseRecord(record)).toThrow();
  });

  it.each([
    ['zero bits per side', {
      ...validBlockHashRecord,
      parameters: { bitsPerSide: 0, method: 2 },
    }],
    ['odd bits per side', {
      ...validBlockHashRecord,
      parameters: { bitsPerSide: 3, method: 2 },
    }],
    ['fractional bits per side', {
      ...validBlockHashRecord,
      parameters: { bitsPerSide: 4.5, method: 2 },
    }],
    ['unsafe derived bit length', {
      ...validBlockHashRecord,
      parameters: { bitsPerSide: 100_000_000, method: 2 },
    }],
    ['unknown method', {
      ...validBlockHashRecord,
      parameters: { bitsPerSide: 4, method: 3 },
    }],
    ['wrong derived bit length', { ...validBlockHashRecord, bitLength: 15 }],
    ['wrong hash length', { ...validBlockHashRecord, hash: 'abc' }],
    ['non-hex hash', { ...validBlockHashRecord, hash: 'abcg' }],
    ['unknown field', { ...validBlockHashRecord, futureField: true }],
    ['unknown parameter field', {
      ...validBlockHashRecord,
      parameters: { bitsPerSide: 4, method: 2, futureField: true },
    }],
  ])('rejects a malformed BlockHash record: %s', (_label, record) => {
    expect(() => parseRecord(record)).toThrow();
  });

  it.each([
    'not JSON',
    'null',
    '[]',
    '"pdq-v1"',
  ])('rejects invalid serialized input: %s', (serialized) => {
    expect(() => parseFingerprint(serialized)).toThrow();
  });

  it('rejects non-string JavaScript input', () => {
    expect(() => parseFingerprint(validPdqRecord as unknown as string)).toThrow();
  });

  it('revalidates records before serialization', () => {
    const invalidRecord = {
      ...validPdqRecord,
      quality: 101,
    } as unknown as ImageFingerprint;

    expect(() => serializeFingerprint(invalidRecord)).toThrow();
  });
});
