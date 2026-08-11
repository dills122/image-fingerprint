const rgbaPixels = (width, height, pixel) => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { format: 'rgba8', width, height, data };
};

const cropPixels = (source, x, y, width, height) => {
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { format: 'rgba8', width, height, data };
};

export const createCropLocalBrowserFixtures = () => [
  {
    name: 'translucent-rings-landscape',
    source: rgbaPixels(144, 112, (x, y) => {
      const checker = ((x >> 3) ^ (y >> 3)) & 1;
      const ring = Math.abs((x - 72) ** 2 + (y - 56) ** 2 - 35 ** 2) < 180;
      return [
        (x * 11 + y * 3 + checker * 71) & 255,
        (x * 2 + y * 13 + (ring ? 89 : 0)) & 255,
        (x * y + checker * 43 + (ring ? 127 : 0)) & 255,
        (x + y) % 17 === 0 ? 143 : 255,
      ];
    }),
    crop: { x: 19, y: 14, width: 101, height: 82 },
  },
  {
    name: 'muted-lines-portrait',
    source: rgbaPixels(91, 157, (x, y) => {
      const paper = 224 + ((x * 3 + y * 5) % 17);
      const line = y % 13 < 3 && x > 11 && x < 80;
      const margin = x > 15 && x < 19;
      const ink = line ? 92 + ((x * 7) % 41) : paper;
      return [
        margin ? 171 : ink,
        margin ? 93 : Math.max(0, ink - 4),
        margin ? 89 : Math.max(0, ink - 9),
        255,
      ];
    }),
    crop: { x: 9, y: 29, width: 73, height: 103 },
  },
  {
    name: 'saturated-grid-wide',
    source: rgbaPixels(211, 83, (x, y) => {
      const cellX = Math.floor(x / 17);
      const cellY = Math.floor(y / 13);
      const border = x % 17 < 2 || y % 13 < 2;
      return border
        ? [28, 34, 49, 255]
        : [
          (cellX * 47 + cellY * 19 + x * 3) & 255,
          (cellX * 13 + cellY * 61 + y * 5) & 255,
          (cellX * 73 + cellY * 29 + x + y) & 255,
          255,
        ];
    }),
    crop: { x: 41, y: 11, width: 139, height: 63 },
  },
  {
    name: 'alpha-gradient-square',
    source: rgbaPixels(128, 128, (x, y) => {
      const distance = Math.abs(x - 64) + Math.abs(y - 64);
      const stripe = ((x + y) >> 3) & 1;
      return [
        (x * 9 + stripe * 83) & 255,
        (y * 7 + distance * 3) & 255,
        ((x ^ y) * 11 + stripe * 37) & 255,
        64 + ((x * 5 + y * 7) % 192),
      ];
    }),
    crop: { x: 18, y: 22, width: 91, height: 87 },
  },
];

export const runCropLocalBrowserFixtures = (api) => Object.fromEntries(
  createCropLocalBrowserFixtures().map(({ name, source, crop }) => {
    const cropped = cropPixels(source, crop.x, crop.y, crop.width, crop.height);
    const sourceFingerprint = api.fingerprintCropLocalItem(source);
    const cropFingerprint = api.fingerprintCropLocalItem(cropped);
    const sourcePacked = api.packCropLocalItemFingerprint(sourceFingerprint);
    const cropPacked = api.packCropLocalItemFingerprint(cropFingerprint);
    const verboseComparison = api.compareCropLocalSourceToCrop(
      sourceFingerprint,
      cropFingerprint,
    );
    const packedComparison = api.comparePackedCropLocalSourceToCrop(
      sourcePacked,
      cropPacked,
    );
    if (JSON.stringify(verboseComparison) !== JSON.stringify(packedComparison)) {
      throw new Error(`${name}: verbose and packed Crop-Local decisions differ`);
    }
    return [name, {
      source: sourceFingerprint,
      crop: cropFingerprint,
      sourcePacked,
      cropPacked,
      comparison: {
        status: verboseComparison.status,
        direction: verboseComparison.direction,
        itemSignal: verboseComparison.itemSignal,
        reasons: verboseComparison.reasons,
        localStatus: verboseComparison.local.status,
        localReasons: verboseComparison.local.reasons,
      },
    }];
  }),
);
