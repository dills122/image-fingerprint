const PDQ_DIMENSION = 64;
const PDQ_JAROSZ_PASSES = 2;

const addFloat32 = (left: number, right: number): number => (
  Math.fround(left + right)
);

const subtractFloat32 = (left: number, right: number): number => (
  Math.fround(left - right)
);

const divideFloat32 = (value: number, divisor: number): number => (
  Math.fround(value / divisor)
);

const box1d = (
  input: Float32Array,
  output: Float32Array,
  vectorLength: number,
  stride: number,
  fullWindowSize: number,
  start: number,
): void => {
  const halfWindowSize = Math.floor((fullWindowSize + 2) / 2);
  const phase1Repetitions = halfWindowSize - 1;
  const phase2Repetitions = fullWindowSize - halfWindowSize + 1;
  const phase3Repetitions = vectorLength - fullWindowSize;
  const phase4Repetitions = halfWindowSize - 1;

  let leftIndex = start;
  let rightIndex = start;
  let outputIndex = start;
  let sum = Math.fround(0);
  let currentWindowSize = 0;

  for (let index = 0; index < phase1Repetitions; index += 1) {
    sum = addFloat32(sum, input[rightIndex]);
    currentWindowSize += 1;
    rightIndex += stride;
  }

  for (let index = 0; index < phase2Repetitions; index += 1) {
    sum = addFloat32(sum, input[rightIndex]);
    currentWindowSize += 1;
    output[outputIndex] = divideFloat32(sum, currentWindowSize);
    rightIndex += stride;
    outputIndex += stride;
  }

  for (let index = 0; index < phase3Repetitions; index += 1) {
    sum = addFloat32(sum, input[rightIndex]);
    sum = subtractFloat32(sum, input[leftIndex]);
    output[outputIndex] = divideFloat32(sum, currentWindowSize);
    leftIndex += stride;
    rightIndex += stride;
    outputIndex += stride;
  }

  for (let index = 0; index < phase4Repetitions; index += 1) {
    sum = subtractFloat32(sum, input[leftIndex]);
    currentWindowSize -= 1;
    output[outputIndex] = divideFloat32(sum, currentWindowSize);
    leftIndex += stride;
    outputIndex += stride;
  }
};

const filterRows = (
  input: Float32Array,
  output: Float32Array,
  height: number,
  width: number,
  windowSize: number,
): void => {
  for (let row = 0; row < height; row += 1) {
    box1d(input, output, width, 1, windowSize, row * width);
  }
};

const filterColumns = (
  input: Float32Array,
  output: Float32Array,
  height: number,
  width: number,
  windowSize: number,
): void => {
  for (let column = 0; column < width; column += 1) {
    box1d(input, output, height, width, windowSize, column);
  }
};

const validateInput = (
  luma: Float32Array,
  width: number,
  height: number,
): void => {
  if (!Number.isSafeInteger(width) || width < 5) {
    throw new RangeError('PDQ luma width must be an integer of at least 5');
  }
  if (!Number.isSafeInteger(height) || height < 5) {
    throw new RangeError('PDQ luma height must be an integer of at least 5');
  }
  const expectedLength = width * height;
  if (!Number.isSafeInteger(expectedLength) || luma.length !== expectedLength) {
    throw new RangeError(
      `Expected ${expectedLength} luma values for a ${width}x${height} image, received ${luma.length}`,
    );
  }
};

/**
 * @internal Applies PDQ's two-pass Jarosz filter and center-based 64x64 decimation.
 * The non-64x64 path consumes and reuses the supplied luma work buffer.
 */
export const downsampleToPdqSize = (
  luma: Float32Array,
  width: number,
  height: number,
): Float32Array => {
  validateInput(luma, width, height);
  if (width === PDQ_DIMENSION && height === PDQ_DIMENSION) {
    return luma.slice();
  }

  const buffer1 = luma;
  const buffer2 = new Float32Array(luma.length);
  const rowWindowSize = Math.ceil(width / (2 * PDQ_DIMENSION));
  const columnWindowSize = Math.ceil(height / (2 * PDQ_DIMENSION));

  for (let pass = 0; pass < PDQ_JAROSZ_PASSES; pass += 1) {
    filterRows(buffer1, buffer2, height, width, rowWindowSize);
    filterColumns(buffer2, buffer1, height, width, columnWindowSize);
  }

  const downsampled = new Float32Array(PDQ_DIMENSION * PDQ_DIMENSION);
  for (let outputRow = 0; outputRow < PDQ_DIMENSION; outputRow += 1) {
    const inputRow = Math.trunc(
      ((outputRow + 0.5) * height) / PDQ_DIMENSION,
    );
    for (let outputColumn = 0; outputColumn < PDQ_DIMENSION; outputColumn += 1) {
      const inputColumn = Math.trunc(
        ((outputColumn + 0.5) * width) / PDQ_DIMENSION,
      );
      downsampled[outputRow * PDQ_DIMENSION + outputColumn] = (
        buffer1[inputRow * width + inputColumn]
      );
    }
  }
  return downsampled;
};
