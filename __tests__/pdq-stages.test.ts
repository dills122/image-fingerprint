import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { computePdqDct } from '../src/core/algorithms/pdq/dct';
import { downsampleToPdqSize } from '../src/core/algorithms/pdq/downsample';
import { hashPdqDct } from '../src/core/algorithms/pdq/hash';
import { toFloatLuma } from '../src/core/algorithms/pdq/luminance';
import { torbenMedian } from '../src/core/algorithms/pdq/median';
import { computePdqQuality } from '../src/core/algorithms/pdq/quality';

const PINNED_COMMIT = 'baefb4ed67b6cdc1d4c82dbaef858d50866ac424';

interface EncodedBytes {
  readonly encoding: 'base64';
  readonly data: string;
  readonly sha256: string;
}

interface StageVector {
  readonly id: string;
  readonly description: string;
  readonly format: 'gray8' | 'rgb8';
  readonly width: number;
  readonly height: number;
  readonly source: EncodedBytes;
  readonly expected: {
    readonly lumaBits?: readonly number[];
    readonly downsampledBits?: readonly number[];
    readonly dctIntermediateBits?: readonly number[];
    readonly dctOutputBits?: readonly number[];
    readonly medianBits?: number;
    readonly hash?: string;
    readonly quality?: number;
  };
}

interface StageCorpus {
  readonly schemaVersion: 1;
  readonly algorithm: 'pdq-v1';
  readonly oracle: {
    readonly repository: 'https://github.com/facebook/ThreatExchange.git';
    readonly commit: string;
  };
  readonly vectors: readonly StageVector[];
}

interface RawVector {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly oracleInput: EncodedBytes & {
    readonly format: 'gray8' | 'rgb8';
  };
  readonly expected: {
    readonly hash: string;
    readonly quality: number;
  };
}

interface RawCorpus {
  readonly vectors: readonly RawVector[];
}

const fixturePath = (name: string): string => join(
  process.cwd(),
  '__tests__',
  'fixtures',
  'pdq',
  name,
);

const loadStageCorpus = (): StageCorpus => JSON.parse(
  readFileSync(fixturePath('stage-vectors.json'), 'utf8'),
) as StageCorpus;

const loadRawCorpus = (): RawCorpus => JSON.parse(
  readFileSync(fixturePath('raw-vectors.json'), 'utf8'),
) as RawCorpus;

const decode = (encoded: EncodedBytes): Uint8Array => Uint8Array.from(
  Buffer.from(encoded.data, 'base64'),
);

const sha256 = (bytes: Uint8Array): string => createHash('sha256')
  .update(bytes)
  .digest('hex');

const floatBits = (values: Float32Array): number[] => {
  const bytes = new ArrayBuffer(4);
  const view = new DataView(bytes);
  return Array.from(values, (value) => {
    view.setFloat32(0, value, true);
    return view.getUint32(0, true);
  });
};

describe('PDQ numeric stages', () => {
  it('pins self-checking stage diagnostics to the normative oracle', () => {
    const corpus = loadStageCorpus();

    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.algorithm).toBe('pdq-v1');
    expect(corpus.oracle).toEqual({
      repository: 'https://github.com/facebook/ThreatExchange.git',
      commit: PINNED_COMMIT,
    });
    expect(corpus.vectors).toHaveLength(3);

    for (const vector of corpus.vectors) {
      const source = decode(vector.source);
      const channels = vector.format === 'gray8' ? 1 : 3;
      expect(source).toHaveLength(vector.width * vector.height * channels);
      expect(sha256(source)).toBe(vector.source.sha256);
      expect(vector.description.length).toBeGreaterThan(0);
    }
  });

  it('matches gray casts and RGB float coefficient ordering bit for bit', () => {
    const vectors = loadStageCorpus().vectors.filter(
      (vector) => vector.expected.lumaBits !== undefined,
    );

    expect(vectors.length).toBeGreaterThanOrEqual(2);
    for (const vector of vectors) {
      const luma = toFloatLuma({
        format: vector.format,
        width: vector.width,
        height: vector.height,
        data: decode(vector.source),
      });
      expect(floatBits(luma), vector.id).toEqual(vector.expected.lumaBits);
    }
  });

  it('matches center decimation and two-pass Jarosz output bit for bit', () => {
    const vectors = loadStageCorpus().vectors.filter(
      (vector) => vector.expected.downsampledBits !== undefined,
    );

    expect(vectors.length).toBeGreaterThanOrEqual(2);
    for (const vector of vectors) {
      const luma = toFloatLuma({
        format: vector.format,
        width: vector.width,
        height: vector.height,
        data: decode(vector.source),
      });
      const downsampled = downsampleToPdqSize(luma, vector.width, vector.height);
      expect(floatBits(downsampled), vector.id).toEqual(
        vector.expected.downsampledBits,
      );
      expect(computePdqQuality(downsampled), vector.id).toBe(
        vector.expected.quality,
      );
    }
  });

  it('matches every frozen raw-vector hash and quality answer', () => {
    for (const vector of loadRawCorpus().vectors) {
      const luma = toFloatLuma({
        format: vector.oracleInput.format,
        width: vector.width,
        height: vector.height,
        data: decode(vector.oracleInput),
      });
      const downsampled = downsampleToPdqSize(luma, vector.width, vector.height);
      expect(computePdqQuality(downsampled), vector.id).toBe(vector.expected.quality);
      expect(hashPdqDct(computePdqDct(downsampled).output), vector.id).toBe(
        vector.expected.hash,
      );
    }
  });

  it('matches both DCT matrix passes bit for bit', () => {
    const vectors = loadStageCorpus().vectors.filter(
      (vector) => vector.expected.dctOutputBits !== undefined,
    );

    expect(vectors.length).toBeGreaterThanOrEqual(2);
    for (const vector of vectors) {
      const luma = toFloatLuma({
        format: vector.format,
        width: vector.width,
        height: vector.height,
        data: decode(vector.source),
      });
      const downsampled = downsampleToPdqSize(luma, vector.width, vector.height);
      const dct = computePdqDct(downsampled);
      expect(floatBits(dct.intermediate), vector.id).toEqual(
        vector.expected.dctIntermediateBits,
      );
      expect(floatBits(dct.output), vector.id).toEqual(
        vector.expected.dctOutputBits,
      );
    }
  });

  it('matches frozen median bits and canonical hashes', () => {
    const vectors = loadStageCorpus().vectors.filter(
      (vector) => vector.expected.hash !== undefined,
    );

    expect(vectors.length).toBeGreaterThanOrEqual(2);
    for (const vector of vectors) {
      const luma = toFloatLuma({
        format: vector.format,
        width: vector.width,
        height: vector.height,
        data: decode(vector.source),
      });
      const downsampled = downsampleToPdqSize(luma, vector.width, vector.height);
      const dct = computePdqDct(downsampled);
      expect(floatBits(Float32Array.of(torbenMedian(dct.output))), vector.id)
        .toEqual([vector.expected.medianBits]);
      expect(hashPdqDct(dct.output), vector.id).toBe(vector.expected.hash);
    }
  });

  it('uses Torben lower-median behavior for even and tie-heavy inputs', () => {
    expect(torbenMedian(Float32Array.from([
      ...Array<number>(128).fill(0),
      ...Array<number>(128).fill(1),
    ]))).toBe(0);
    expect(torbenMedian(Float32Array.from([
      ...Array<number>(127).fill(0),
      0.5,
      0.5,
      ...Array<number>(127).fill(1),
    ]))).toBe(0.5);
    expect(torbenMedian(Float32Array.from([
      ...Array<number>(127).fill(0),
      ...Array<number>(129).fill(1),
    ]))).toBe(1);
    expect(torbenMedian(Float32Array.of(0, 2, 3))).toBe(2);
  });

  it('uses strict thresholding and Meta word serialization order', () => {
    expect(hashPdqDct(new Float32Array(256))).toBe('0'.repeat(64));

    const coefficients = new Float32Array(256);
    for (const index of [0, 15, 16, 255]) {
      coefficients[index] = 1;
    }
    expect(hashPdqDct(coefficients)).toBe(
      `8000${'0000'.repeat(13)}00018001`,
    );
  });

  it('preserves the exact 64 by 64 fast path and quality endpoints', () => {
    const flat = new Float32Array(64 * 64);
    expect(downsampleToPdqSize(flat, 64, 64)).not.toBe(flat);
    expect(floatBits(downsampleToPdqSize(flat, 64, 64))).toEqual(floatBits(flat));
    expect(computePdqQuality(flat)).toBe(0);

    const checkerboard = Float32Array.from(
      { length: 64 * 64 },
      (_, index) => ((Math.floor(index / 64) + index % 64) % 2) * 255,
    );
    expect(computePdqQuality(checkerboard)).toBe(100);
  });

  it('rejects invalid internal stage shapes', () => {
    expect(() => downsampleToPdqSize(new Float32Array(25), 4, 5)).toThrow(
      /width must be an integer of at least 5/,
    );
    expect(() => downsampleToPdqSize(new Float32Array(25), 5, 4)).toThrow(
      /height must be an integer of at least 5/,
    );
    expect(() => downsampleToPdqSize(new Float32Array(24), 5, 5)).toThrow(
      /Expected 25 luma values/,
    );
    expect(() => computePdqQuality(new Float32Array(4095))).toThrow(
      /Expected 4096 downsampled luma values/,
    );
    expect(() => computePdqDct(new Float32Array(4095))).toThrow(
      /Expected 4096 downsampled luma values/,
    );
    expect(() => torbenMedian(new Float32Array())).toThrow(
      /at least one value/,
    );
    expect(() => hashPdqDct(new Float32Array(255))).toThrow(
      /Expected 256 DCT coefficients/,
    );
  });
});
