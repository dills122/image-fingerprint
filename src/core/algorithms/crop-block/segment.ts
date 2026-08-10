export type CropBlockSegmentKind = 'bright' | 'dark' | 'fallback';
export type CropBlockBox = readonly [number, number, number, number];

export interface CropBlockRegion {
  readonly kind: CropBlockSegmentKind;
  readonly area: number;
  readonly box: CropBlockBox;
}

const kindOrder = (kind: CropBlockSegmentKind): number => (
  kind === 'bright' ? 0 : kind === 'dark' ? 1 : 2
);

export const compareCropBlockRegions = (
  left: CropBlockRegion,
  right: CropBlockRegion,
): number => (
  right.area - left.area
  || left.box[1] - right.box[1]
  || left.box[0] - right.box[0]
  || left.box[3] - right.box[3]
  || left.box[2] - right.box[2]
  || kindOrder(left.kind) - kindOrder(right.kind)
);

export const segmentBinaryRegions = (
  luminance: Uint8Array,
  width: number,
  height: number,
  minimumArea: number,
): CropBlockRegion[] => {
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || luminance.length !== pixelCount) {
    throw new RangeError('segmentation luminance length does not match its dimensions');
  }
  if (!Number.isSafeInteger(minimumArea) || minimumArea < 0) {
    throw new RangeError('minimum component area must be a non-negative integer');
  }

  const visited = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  const regions: CropBlockRegion[] = [];
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (visited[seed] !== 0) continue;
    const bright = luminance[seed] > 128;
    visited[seed] = 1;
    stack[0] = seed;
    let stackLength = 1;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;

    while (stackLength > 0) {
      stackLength -= 1;
      const current = stack[stackLength];
      const y = Math.floor(current / width);
      const x = current - y * width;
      area += 1;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);

      const visit = (neighbor: number): void => {
        if (
          visited[neighbor] === 0
          && (luminance[neighbor] > 128) === bright
        ) {
          visited[neighbor] = 1;
          stack[stackLength] = neighbor;
          stackLength += 1;
        }
      };
      if (x > 0) visit(current - 1);
      if (x + 1 < width) visit(current + 1);
      if (y > 0) visit(current - width);
      if (y + 1 < height) visit(current + width);
    }

    if (area > minimumArea) {
      regions.push({
        kind: bright ? 'bright' : 'dark',
        area,
        box: [x0, y0, x1, y1],
      });
    }
  }
  return regions.sort(compareCropBlockRegions);
};
