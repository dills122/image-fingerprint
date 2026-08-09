import { normalizePixelSource } from '../../pixels';
import type { PdqFingerprint, PixelSource } from '../../types';
import { computePdqDct } from './dct';
import { downsampleToPdqSize } from './downsample';
import { hashPdqDct } from './hash';
import { toFloatLuma } from './luminance';
import { computePdqQuality } from './quality';

/** @internal Composes the frozen portable PDQ stages into a public record. */
export const fingerprintPdq = (image: PixelSource): PdqFingerprint => {
  const normalized = normalizePixelSource(image);
  const luma = toFloatLuma(normalized);
  const downsampled = downsampleToPdqSize(
    luma,
    normalized.width,
    normalized.height,
  );
  const quality = computePdqQuality(downsampled);
  const { output } = computePdqDct(downsampled);

  return {
    schemaVersion: 1,
    algorithm: 'pdq-v1',
    encoding: 'hex',
    hash: hashPdqDct(output),
    bitLength: 256,
    quality,
  };
};
