import { torbenMedian } from './median';

const PDQ_DIMENSION = 16;
const PDQ_HASH_WORDS = 16;
const PDQ_COEFFICIENTS = PDQ_DIMENSION * PDQ_DIMENSION;

/**
 * @internal Converts PDQ's DCT coefficients to Meta's canonical 256-bit hex.
 * Coefficients equal to the Torben median remain clear.
 */
export const hashPdqDct = (coefficients: Float32Array): string => {
  if (coefficients.length !== PDQ_COEFFICIENTS) {
    throw new RangeError(
      `Expected ${PDQ_COEFFICIENTS} DCT coefficients, received ${coefficients.length}`,
    );
  }

  const median = torbenMedian(coefficients);
  const words = new Uint16Array(PDQ_HASH_WORDS);
  for (let index = 0; index < coefficients.length; index += 1) {
    if (coefficients[index] > median) {
      words[index >>> 4] |= 1 << (index & 15);
    }
  }

  let hash = '';
  for (let index = words.length - 1; index >= 0; index -= 1) {
    hash += words[index].toString(16).padStart(4, '0');
  }
  return hash;
};
