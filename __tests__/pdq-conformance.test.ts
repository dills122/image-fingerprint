import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fingerprintPixels,
  type PixelSource,
} from '../src/core';
import { fingerprintPixels as fingerprintPixelsInBrowser } from '../src/browser';

type PixelFormat = PixelSource['format'];

interface CorpusVector {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: PixelFormat;
  readonly source: {
    readonly encoding: 'base64';
    readonly data: string;
  };
  readonly expected: {
    readonly hash: string;
    readonly quality: number;
  };
}

interface Corpus {
  readonly vectors: readonly CorpusVector[];
}

const fixturePath = join(
  process.cwd(),
  '__tests__',
  'fixtures',
  'pdq',
  'raw-vectors.json',
);

const loadCorpus = (): Corpus => JSON.parse(
  readFileSync(fixturePath, 'utf8'),
) as Corpus;

const toPixelSource = (vector: CorpusVector): PixelSource => {
  const data = Uint8Array.from(Buffer.from(vector.source.data, 'base64'));
  const dimensions = {
    width: vector.width,
    height: vector.height,
  };

  switch (vector.format) {
    case 'gray8':
      return { format: 'gray8', ...dimensions, data };
    case 'rgb8':
      return { format: 'rgb8', ...dimensions, data };
    case 'rgba8':
      return { format: 'rgba8', ...dimensions, data };
  }
};

describe('pdq-v1 fingerprint dispatch', () => {
  it('returns the approved record for every fixed gray, RGB, and RGBA vector', () => {
    const corpus = loadCorpus();

    expect(new Set(corpus.vectors.map((vector) => vector.format))).toEqual(
      new Set(['gray8', 'rgb8', 'rgba8']),
    );

    for (const vector of corpus.vectors) {
      expect(fingerprintPixels(toPixelSource(vector), {
        algorithm: 'pdq-v1',
      }), vector.id).toEqual({
        schemaVersion: 1,
        algorithm: 'pdq-v1',
        encoding: 'hex',
        hash: vector.expected.hash,
        bitLength: 256,
        quality: vector.expected.quality,
      });
    }
  });

  it('exposes the same runtime-neutral dispatch from the browser entrypoint', () => {
    const vector = loadCorpus().vectors.find(({ format }) => format === 'rgba8');
    if (vector === undefined) {
      throw new Error('Expected the conformance corpus to contain an rgba8 vector');
    }

    expect(fingerprintPixelsInBrowser(toPixelSource(vector), {
      algorithm: 'pdq-v1',
    })).toEqual(fingerprintPixels(toPixelSource(vector), {
      algorithm: 'pdq-v1',
    }));
  });

  it.each([
    ['width', 4, 5, 'Image width must be at least 5 pixels'],
    ['height', 5, 4, 'Image height must be at least 5 pixels'],
  ] as const)(
    'rejects a %s below the PDQ minimum before hashing',
    (_dimension, width, height, expectedMessage) => {
      expect(() => fingerprintPixels({
        format: 'gray8',
        width,
        height,
        data: new Uint8Array(width * height),
      }, {
        algorithm: 'pdq-v1',
      })).toThrow(expectedMessage);
    },
  );

  it.each([
    ['gray8', 24, 'Expected 25 gray8 values for a 5x5 image, received 24'],
    ['rgb8', 74, 'Expected 75 rgb8 values for a 5x5 image, received 74'],
    ['rgba8', 99, 'Expected 100 rgba8 values for a 5x5 image, received 99'],
  ] as const)(
    'rejects a malformed %s buffer before hashing',
    (format, length, expectedMessage) => {
      expect(() => fingerprintPixels({
        format,
        width: 5,
        height: 5,
        data: new Uint8Array(length),
      }, {
        algorithm: 'pdq-v1',
      })).toThrow(expectedMessage);
    },
  );
});
