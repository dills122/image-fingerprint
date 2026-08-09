import type { Gray8PixelSource, Rgb8PixelSource } from '../../types';

const RED_COEFFICIENT = Math.fround(0.299);
const GREEN_COEFFICIENT = Math.fround(0.587);
const BLUE_COEFFICIENT = Math.fround(0.114);

type LumaPixelSource = Gray8PixelSource | Rgb8PixelSource;

const multiplyFloat32 = (left: number, right: number): number => (
  Math.fround(left * right)
);

const multiplyThenAddFloat32 = (
  left: number,
  right: number,
  addend: number,
): number => (
  Math.fround(multiplyFloat32(left, right) + addend)
);

/** @internal Converts normalized gray or RGB bytes to PDQ float32 luminance. */
export const toFloatLuma = (image: LumaPixelSource): Float32Array => {
  if (image.format === 'gray8') {
    return Float32Array.from(image.data);
  }

  const luma = new Float32Array(image.width * image.height);
  for (let sourceIndex = 0, targetIndex = 0;
    sourceIndex < image.data.length;
    sourceIndex += 3, targetIndex += 1) {
    const green = multiplyFloat32(GREEN_COEFFICIENT, image.data[sourceIndex + 1]);
    const redGreen = multiplyThenAddFloat32(
      RED_COEFFICIENT,
      image.data[sourceIndex],
      green,
    );
    luma[targetIndex] = multiplyThenAddFloat32(
      BLUE_COEFFICIENT,
      image.data[sourceIndex + 2],
      redGreen,
    );
  }
  return luma;
};
