import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const paintRectangle = (image, x, y, width, height, color) => {
  for (let row = Math.max(0, y); row < Math.min(image.height, y + height); row += 1) {
    for (let column = Math.max(0, x); column < Math.min(image.width, x + width); column += 1) {
      const index = (row * image.width + column) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 255;
    }
  }
};

export const cropLocalSyntheticFixtureDimensions = domain => ({
  width: domain === 'screenshot' ? 1100 : 820,
  height: domain === 'screenshot' ? 760 : 1120,
});

export const createCropLocalSyntheticFixture = (domain, seed, style) => {
  if (!['screenshot', 'card-layout'].includes(domain)) {
    throw new RangeError(`unsupported crop-local synthetic domain: ${domain}`);
  }
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError('crop-local synthetic seed must be a non-negative safe integer');
  }
  if (![3, 4].includes(style)) {
    throw new RangeError(`unsupported crop-local synthetic style: ${style}`);
  }
  const { width, height } = cropLocalSyntheticFixtureDimensions(domain);
  const image = new PNG({ width, height, colorType: 6 });
  let state = ((seed + 1) * 0x9e37_79b1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  if (style === 4 && domain === 'screenshot') {
    paintRectangle(image, 0, 0, width, height, [30, 34, 42]);
    paintRectangle(image, 0, 0, width, 94, [238, 242, 246]);
    paintRectangle(image, 24, 24, 210 + random() % 120, 22, [62, 76, 96]);
    paintRectangle(image, 0, 94, 190, height - 94, [45, 50, 62]);
    for (let item = 0; item < 7; item += 1) {
      paintRectangle(image, 26, 130 + item * 78, 26, 26, [75 + random() % 150, 65 + random() % 150, 85 + random() % 140]);
      paintRectangle(image, 66, 134 + item * 78, 65 + random() % 45, 9, [185, 194, 204]);
      paintRectangle(image, 66, 151 + item * 78, 38 + random() % 75, 6, [110, 124, 142]);
    }
    paintRectangle(image, 222, 126, 844, 190, [247, 248, 250]);
    for (let column = 0; column < 7; column += 1) {
      const barHeight = 35 + random() % 115;
      paintRectangle(image, 260 + column * 108, 286 - barHeight, 58, barHeight, [45 + random() % 190, 55 + random() % 180, 65 + random() % 170]);
    }
    for (let row = 0; row < 7; row += 1) {
      const y = 350 + row * 52;
      paintRectangle(image, 222, y, 844, 42, row % 2 === 0 ? [245, 247, 249] : [232, 236, 241]);
      paintRectangle(image, 246, y + 12, 75 + random() % 130, 8, [68, 82, 104]);
      for (let cell = 0; cell < 4; cell += 1) {
        paintRectangle(image, 470 + cell * 135, y + 11, 35 + random() % 78, 10, [75 + random() % 145, 70 + random() % 145, 80 + random() % 145]);
      }
    }
  } else if (style === 4) {
    paintRectangle(image, 0, 0, width, height, [18, 22, 28]);
    paintRectangle(image, 30, 30, width - 60, height - 60, [198 + seed % 38, 185 + random() % 38, 158 + random() % 48]);
    paintRectangle(image, 58, 58, width - 116, 78, [235, 230, 212]);
    paintRectangle(image, 78, 82, 250 + random() % 270, 14, [40, 42, 38]);
    for (let symbol = 0; symbol < 5; symbol += 1) {
      paintRectangle(image, width - 220 + symbol * 30, 79, 18, 18, [45 + random() % 190, 45 + random() % 190, 45 + random() % 190]);
    }
    paintRectangle(image, 58, 154, width - 116, 470, [30 + random() % 205, 30 + random() % 205, 30 + random() % 205]);
    for (let tile = 0; tile < 12; tile += 1) {
      const x = 72 + (tile % 4) * 168;
      const y = 172 + Math.floor(tile / 4) * 142;
      paintRectangle(image, x, y, 142, 118, [35 + random() % 200, 35 + random() % 200, 35 + random() % 200]);
      paintRectangle(image, x + 18, y + 18, 55 + random() % 65, 14 + random() % 42, [35 + random() % 200, 35 + random() % 200, 35 + random() % 200]);
    }
    paintRectangle(image, 58, 650, width - 116, 48, [225, 218, 195]);
    paintRectangle(image, 76, 668, 180 + random() % 330, 11, [48, 45, 40]);
    paintRectangle(image, 58, 716, width - 116, 330, [232, 226, 205]);
    for (let line = 0; line < 10; line += 1) {
      paintRectangle(image, 82, 748 + line * 25, 180 + random() % 465, 8, [50 + line, 48, 43]);
    }
    paintRectangle(image, 82, 1012, 170 + random() % 420, 13, [60 + random() % 130, 52, 48]);
  } else if (domain === 'screenshot') {
    paintRectangle(image, 0, 0, width, height, [246, 241, 234]);
    paintRectangle(image, 0, 0, width, 76, [28, 38 + seed % 40, 62]);
    paintRectangle(image, 0, 76, 248, height - 76, [218, 226, 232]);
    for (let section = 0; section < 8; section += 1) {
      paintRectangle(image, 30, 112 + section * 72, 110 + random() % 85, 12, [82, 102, 122]);
      paintRectangle(image, 30, 134 + section * 72, 65 + random() % 120, 7, [150, 165, 178]);
    }
    for (let panel = 0; panel < 9; panel += 1) {
      const x = 280 + (panel % 3) * 265;
      const y = 108 + Math.floor(panel / 3) * 205;
      paintRectangle(image, x, y, 232, 174, [255, 255, 255]);
      paintRectangle(image, x + 16, y + 16, 52, 52, [50 + random() % 180, 50 + random() % 180, 50 + random() % 180]);
      for (let line = 0; line < 5; line += 1) {
        paintRectangle(image, x + 82, y + 18 + line * 23, 70 + random() % 120, 8, [90 + line * 12, 105, 125]);
      }
      paintRectangle(image, x + 16, y + 132, 70 + random() % 135, 18, [35 + random() % 180, 110, 95]);
    }
  } else {
    paintRectangle(image, 0, 0, width, height, [25, 30, 42]);
    paintRectangle(image, 34, 34, width - 68, height - 68, [225 + seed % 20, 218, 194]);
    paintRectangle(image, 76, 80, width - 152, 126, [45 + random() % 160, 45 + random() % 160, 65 + random() % 150]);
    paintRectangle(image, 92, 236, width - 184, 420, [35 + random() % 200, 45 + random() % 190, 55 + random() % 180]);
    for (let marker = 0; marker < 7; marker += 1) {
      paintRectangle(image, 112 + marker * 86, 680, 48, 48, [55 + random() % 180, 65 + random() % 170, 75 + random() % 160]);
    }
    for (let line = 0; line < 11; line += 1) {
      paintRectangle(image, 92, 770 + line * 25, 250 + random() % 390, 9, [50, 47 + line * 2, 44]);
    }
    paintRectangle(image, 92, 1062, 190 + random() % 390, 15, [85 + random() % 100, 62, 58]);
  }
  return PNG.sync.write(image, { colorType: 6 });
};
