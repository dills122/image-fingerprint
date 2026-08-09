const PDQ_DIMENSION = 64;
const PDQ_VALUE_COUNT = PDQ_DIMENSION * PDQ_DIMENSION;

const quantizedGradient = (left: number, right: number): number => {
  const difference = Math.fround(left - right);
  const percentage = Math.fround(Math.fround(difference * 100) / 255);
  return Math.abs(Math.trunc(percentage));
};

/** @internal Computes Meta PDQ's image-domain quality heuristic. */
export const computePdqQuality = (luma64x64: Float32Array): number => {
  if (luma64x64.length !== PDQ_VALUE_COUNT) {
    throw new RangeError(
      `Expected ${PDQ_VALUE_COUNT} downsampled luma values, received ${luma64x64.length}`,
    );
  }

  let gradientSum = 0;
  for (let row = 0; row < PDQ_DIMENSION - 1; row += 1) {
    for (let column = 0; column < PDQ_DIMENSION; column += 1) {
      const index = row * PDQ_DIMENSION + column;
      gradientSum += quantizedGradient(
        luma64x64[index],
        luma64x64[index + PDQ_DIMENSION],
      );
    }
  }
  for (let row = 0; row < PDQ_DIMENSION; row += 1) {
    for (let column = 0; column < PDQ_DIMENSION - 1; column += 1) {
      const index = row * PDQ_DIMENSION + column;
      gradientSum += quantizedGradient(luma64x64[index], luma64x64[index + 1]);
    }
  }

  return Math.min(100, Math.trunc(gradientSum / 90));
};
