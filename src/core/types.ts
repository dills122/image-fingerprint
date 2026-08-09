export type FingerprintAlgorithm = 'blockhash-v1' | 'pdq-v1';
export type FingerprintEncoding = 'hex';
export type FingerprintSchemaVersion = 1;

/**
 * Tightly packed, row-major, 8-bit RGBA pixels.
 *
 * Values are interpreted as sRGB with straight (unassociated) alpha. Browser
 * ImageData and Node decoder results are structurally compatible with this
 * boundary without introducing Node or DOM types into the algorithm core.
 */
export interface RgbaImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface Gray8PixelSource {
  readonly format: 'gray8';
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface Rgb8PixelSource {
  readonly format: 'rgb8';
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface Rgba8PixelSource {
  readonly format: 'rgba8';
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export type PixelSource = (
  Gray8PixelSource | Rgb8PixelSource | Rgba8PixelSource
);
export type BlockHashPixelSource = RgbaImageData | Rgba8PixelSource;

export interface BlockHashParameters {
  /** Number of hash blocks along each image dimension. */
  readonly bitsPerSide: number;
  /** Preserve legacy method 1 (quick) or method 2 (precise) behavior. */
  readonly method: 1 | 2;
}

export interface BlockHashFingerprint {
  readonly schemaVersion: FingerprintSchemaVersion;
  readonly algorithm: 'blockhash-v1';
  readonly encoding: FingerprintEncoding;
  readonly hash: string;
  readonly bitLength: number;
  readonly parameters: BlockHashParameters;
}

export interface BlockHashFingerprintOptions extends BlockHashParameters {
  readonly algorithm: 'blockhash-v1';
}

export interface PdqFingerprint {
  readonly schemaVersion: FingerprintSchemaVersion;
  readonly algorithm: 'pdq-v1';
  readonly encoding: FingerprintEncoding;
  readonly hash: string;
  readonly bitLength: 256;
  readonly quality: number;
}

export interface PdqFingerprintOptions {
  readonly algorithm: 'pdq-v1';
}

export type ImageFingerprint = BlockHashFingerprint | PdqFingerprint;
export type FingerprintOptions = (
  BlockHashFingerprintOptions | PdqFingerprintOptions
);
