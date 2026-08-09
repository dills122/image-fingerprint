import { createPdqDctMatrix } from './dct-matrix';

const PDQ_INPUT_DIMENSION = 64;
const PDQ_OUTPUT_DIMENSION = 16;
const PDQ_INPUT_LENGTH = PDQ_INPUT_DIMENSION * PDQ_INPUT_DIMENSION;
const DCT_MATRIX_LENGTH = PDQ_OUTPUT_DIMENSION * PDQ_INPUT_DIMENSION;

const multiplyAddFloat32 = (
  left: number,
  right: number,
  accumulator: number,
): number => Math.fround(Math.fround(left * right) + accumulator);

const DCT_MATRIX = createPdqDctMatrix();

export interface PdqDctResult {
  readonly intermediate: Float32Array;
  readonly output: Float32Array;
}

/**
 * @internal Applies PDQ's 64x64 to 16x16 DCT, excluding the DC coefficients.
 * Multiplication and addition are separately rounded to float32, matching the
 * portable unfused C++/WebAssembly numeric profile.
 */
export const computePdqDct = (
  downsampledLuma: Float32Array,
): PdqDctResult => {
  if (downsampledLuma.length !== PDQ_INPUT_LENGTH) {
    throw new RangeError(
      `Expected ${PDQ_INPUT_LENGTH} downsampled luma values, received ${downsampledLuma.length}`,
    );
  }

  const intermediate = new Float32Array(DCT_MATRIX_LENGTH);
  for (let row = 0; row < PDQ_OUTPUT_DIMENSION; row += 1) {
    const matrixRowOffset = row * PDQ_INPUT_DIMENSION;
    for (let column = 0; column < PDQ_INPUT_DIMENSION; column += 1) {
      let sum = Math.fround(0);
      for (let term = 0; term < PDQ_INPUT_DIMENSION; term += 1) {
        sum = multiplyAddFloat32(
          DCT_MATRIX[matrixRowOffset + term],
          downsampledLuma[term * PDQ_INPUT_DIMENSION + column],
          sum,
        );
      }
      intermediate[matrixRowOffset + column] = sum;
    }
  }

  const output = new Float32Array(PDQ_OUTPUT_DIMENSION * PDQ_OUTPUT_DIMENSION);
  for (let row = 0; row < PDQ_OUTPUT_DIMENSION; row += 1) {
    const intermediateRowOffset = row * PDQ_INPUT_DIMENSION;
    for (let column = 0; column < PDQ_OUTPUT_DIMENSION; column += 1) {
      const matrixRowOffset = column * PDQ_INPUT_DIMENSION;
      let sum = Math.fround(0);
      for (let term = 0; term < PDQ_INPUT_DIMENSION; term += 1) {
        sum = multiplyAddFloat32(
          intermediate[intermediateRowOffset + term],
          DCT_MATRIX[matrixRowOffset + term],
          sum,
        );
      }
      output[row * PDQ_OUTPUT_DIMENSION + column] = sum;
    }
  }

  return { intermediate, output };
};
