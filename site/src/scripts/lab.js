/* Browser-side teaching model for the 16 × 16 block-hash comparison. */

const BITS = 16;
const TOTAL_BITS = BITS * BITS;
const THEME_KEY = 'image-fingerprint-theme';

const state = {
  mode: 'reencode',
  image: null,
  objectUrl: null,
  renderId: 0,
  sourceCanvas: null,
};

const elements = {
  sourcePreview: document.querySelector('#source-preview'),
  resultCanvas: document.querySelector('#result-canvas'),
  sourceHashMap: document.querySelector('#source-hash-map'),
  resultHashMap: document.querySelector('#result-hash-map'),
  strength: document.querySelector('#strength'),
  strengthLabel: document.querySelector('#strength-label'),
  strengthValue: document.querySelector('#strength-value'),
  strengthHelp: document.querySelector('#strength-help'),
  resultCaption: document.querySelector('#result-caption'),
  similarity: document.querySelector('#similarity'),
  scoreLabel: document.querySelector('#score-label'),
  scoreNote: document.querySelector('#score-note'),
  sourceHash: document.querySelector('#source-hash'),
  resultHash: document.querySelector('#result-hash'),
  hashDistance: document.querySelector('#hash-distance'),
  fileInput: document.querySelector('#file-input'),
  fileStatus: document.querySelector('#file-status'),
  controls: document.querySelector('#hash-controls'),
  labStage: document.querySelector('#lab-stage'),
  tabs: [...document.querySelectorAll('[role="tab"]')],
  sampleCards: [...document.querySelectorAll('.sample-card')],
  copyButton: document.querySelector('#copy-code'),
  apiCode: document.querySelector('#api-code'),
  themeToggle: document.querySelector('#theme-toggle'),
};

function setTheme(theme, persist = false) {
  const dusk = theme === 'dusk';
  document.documentElement.dataset.theme = dusk ? 'dusk' : 'light';
  elements.themeToggle.setAttribute('aria-pressed', String(dusk));
  elements.themeToggle.setAttribute(
    'aria-label',
    dusk ? 'Switch to light theme' : 'Switch to warm dusk theme',
  );

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, dusk ? 'dusk' : 'light');
    } catch {
      // The theme still works for this page when storage is unavailable.
    }
  }
  if (state.image) updateLab();
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function translateBlocksToBits(blocks, pixelsPerBlock) {
  const halfBlockValue = (pixelsPerBlock * 256 * 3) / 2;
  const bandSize = blocks.length / 4;

  for (let band = 0; band < 4; band += 1) {
    const start = band * bandSize;
    const bandMedian = median(blocks.slice(start, start + bandSize));
    for (let index = start; index < start + bandSize; index += 1) {
      const value = blocks[index];
      blocks[index] = Number(
        value > bandMedian
        || (Math.abs(value - bandMedian) < 1 && bandMedian > halfBlockValue),
      );
    }
  }
}

function bitsToHex(bits) {
  const hex = [];
  for (let index = 0; index < bits.length; index += 4) {
    hex.push(Number.parseInt(bits.slice(index, index + 4).join(''), 2).toString(16));
  }
  return hex.join('');
}

function blockHash(imageData, bits = BITS) {
  const { width, height, data } = imageData;
  const blockWidth = Math.floor(width / bits);
  const blockHeight = Math.floor(height / bits);
  const blocks = [];

  for (let blockY = 0; blockY < bits; blockY += 1) {
    for (let blockX = 0; blockX < bits; blockX += 1) {
      let total = 0;
      for (let pixelY = 0; pixelY < blockHeight; pixelY += 1) {
        for (let pixelX = 0; pixelX < blockWidth; pixelX += 1) {
          const x = blockX * blockWidth + pixelX;
          const y = blockY * blockHeight + pixelY;
          const offset = (y * width + x) * 4;
          total += data[offset + 3] === 0
            ? 765
            : data[offset] + data[offset + 1] + data[offset + 2];
        }
      }
      blocks.push(total);
    }
  }

  translateBlocksToBits(blocks, blockWidth * blockHeight);
  return { bits: blocks, hex: bitsToHex(blocks) };
}

function hammingDistance(firstBits, secondBits) {
  return firstBits.reduce(
    (distance, bit, index) => distance + Number(bit !== secondBits[index]),
    0,
  );
}

function canvasPaper() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--color-paper')
    .trim();
}

function drawContained(context, image, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  context.clearRect(0, 0, width, height);
  context.fillStyle = canvasPaper();
  context.fillRect(0, 0, width, height);
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function drawSource() {
  const canvas = elements.sourcePreview;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  drawContained(
    context,
    state.image,
    canvas.width,
    canvas.height,
  );
  state.sourceCanvas = canvas;
  return canvas;
}

function canvasToImage(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The browser could not encode this preview.'));
        return;
      }

      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('The encoded preview could not be read.'));
      };
      image.src = url;
    }, 'image/jpeg', quality);
  });
}

async function transformedCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = elements.resultCanvas.width;
  canvas.height = elements.resultCanvas.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const value = Number(elements.strength.value);

  if (state.mode === 'brightness') {
    context.filter = `brightness(${value}%)`;
    drawContained(context, state.image, canvas.width, canvas.height);
    context.filter = 'none';
    return canvas;
  }

  if (state.mode === 'crop') {
    const ratio = value / 100;
    const cropX = state.image.width * ratio;
    const cropY = state.image.height * ratio;
    const cropWidth = Math.max(1, state.image.width - cropX * 2);
    const cropHeight = Math.max(1, state.image.height - cropY * 2);
    context.fillStyle = canvasPaper();
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      state.image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas;
  }

  drawContained(context, state.image, canvas.width, canvas.height);
  const encoded = await canvasToImage(canvas, value / 100);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(encoded, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function classifySimilarity(percent, distance) {
  if (distance === 0) {
    return [
      'Same fingerprint',
      'The transform changed pixels, but none of the 256 fingerprint bits moved.',
    ];
  }
  if (percent >= 95) {
    return [
      'Very close visually',
      'Only a small number of coarse brightness relationships changed.',
    ];
  }
  if (percent >= 85) {
    return [
      'Likely related',
      'The images still share most of their visual fingerprint.',
    ];
  }
  if (percent >= 70) {
    return [
      'Needs your threshold',
      'The relationship is plausible, but the changed region is now substantial.',
    ];
  }
  return [
    'Visually distant',
    'Much of the coarse spatial brightness pattern has changed.',
  ];
}

function drawHashMap(container, bits, comparisonBits) {
  const fragment = document.createDocumentFragment();
  bits.forEach((bit, index) => {
    const cell = document.createElement('span');
    cell.className = 'hash-map__cell';
    if (bit === 1) cell.classList.add('hash-map__cell--one');
    if (comparisonBits && bit !== comparisonBits[index]) {
      cell.classList.add('hash-map__cell--changed');
    }
    fragment.append(cell);
  });
  container.replaceChildren(fragment);
}

async function updateLab() {
  if (!state.image) return;

  const renderId = ++state.renderId;
  elements.controls.setAttribute('aria-busy', 'true');
  elements.scoreLabel.textContent = 'Calculating…';

  try {
    const sourceCanvas = drawSource();
    const transformed = await transformedCanvas();
    if (renderId !== state.renderId) return;

    const resultContext = elements.resultCanvas.getContext('2d', { willReadFrequently: true });
    resultContext.clearRect(0, 0, elements.resultCanvas.width, elements.resultCanvas.height);
    resultContext.drawImage(transformed, 0, 0);

    const sourceData = sourceCanvas
      .getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const resultData = resultContext.getImageData(
      0,
      0,
      elements.resultCanvas.width,
      elements.resultCanvas.height,
    );
    const source = blockHash(sourceData);
    const result = blockHash(resultData);
    const distance = hammingDistance(source.bits, result.bits);
    const percent = Math.round((1 - distance / TOTAL_BITS) * 100);
    const [label, note] = classifySimilarity(percent, distance);

    elements.similarity.textContent = `${percent}%`;
    elements.scoreLabel.textContent = label;
    elements.scoreNote.textContent = note;
    elements.sourceHash.textContent = source.hex;
    elements.resultHash.textContent = result.hex;
    elements.hashDistance.textContent = `${distance} of ${TOTAL_BITS} bits differ`;
    drawHashMap(elements.sourceHashMap, source.bits, result.bits);
    drawHashMap(elements.resultHashMap, result.bits, source.bits);
  } catch (error) {
    elements.similarity.textContent = '—';
    elements.scoreLabel.textContent = 'The preview could not be calculated.';
    elements.scoreNote.textContent = 'Try another JPG, PNG, or WebP image.';
    elements.fileStatus.textContent = `${error.message} Choose another image.`;
  } finally {
    if (renderId === state.renderId) {
      elements.controls.removeAttribute('aria-busy');
    }
  }
}

function setMode(mode) {
  state.mode = mode;
  const modeSettings = {
    reencode: {
      label: 'JPEG quality',
      min: 20,
      max: 100,
      value: 65,
      help: 'Re-encodes the preview before hashing.',
      caption: 'JPEG re-encode',
    },
    brightness: {
      label: 'Brightness',
      min: 60,
      max: 140,
      value: 112,
      help: 'Changes every pixel’s brightness.',
      caption: 'Brightness-adjusted',
    },
    crop: {
      label: 'Crop per edge',
      min: 0,
      max: 18,
      value: 6,
      help: 'Removes content from all four edges.',
      caption: 'Centre crop',
    },
  }[mode];

  elements.tabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  elements.strengthLabel.textContent = modeSettings.label;
  elements.strength.min = modeSettings.min;
  elements.strength.max = modeSettings.max;
  elements.strength.value = modeSettings.value;
  elements.strengthValue.textContent = `${modeSettings.value}%`;
  elements.strengthHelp.textContent = modeSettings.help;
  elements.resultCaption.textContent = modeSettings.caption;
  elements.labStage.setAttribute('aria-labelledby', `tab-${mode}`);
  updateLab();
}

function selectCardButton(selectedButton) {
  elements.sampleCards.forEach((button) => {
    button.setAttribute('aria-pressed', String(button === selectedButton));
  });
}

function loadImage(source, description) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      elements.fileStatus.textContent = `${description} Pixels stay in this browser.`;
      elements.fileInput.removeAttribute('aria-invalid');
      updateLab().then(resolve);
    };
    image.onerror = () => reject(new Error('The image could not be read.'));
    image.src = source;
  });
}

elements.sampleCards.forEach((button) => {
  button.addEventListener('click', () => {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    elements.fileInput.value = '';
    selectCardButton(button);
    loadImage(button.dataset.cardSrc, `${button.dataset.cardName} loaded.`).catch((error) => {
      elements.fileStatus.textContent = `${error.message} Try another sample.`;
    });
  });
});

elements.tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const target = elements.tabs[(index + direction + elements.tabs.length) % elements.tabs.length];
    target.focus({ preventScroll: true });
    setMode(target.dataset.mode);
  });
});

elements.strength.addEventListener('input', () => {
  elements.strengthValue.textContent = `${elements.strength.value}%`;
  updateLab();
});

elements.fileInput.addEventListener('change', () => {
  const [file] = elements.fileInput.files;
  if (!file) return;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  selectCardButton(null);
  loadImage(state.objectUrl, `${file.name} loaded.`).catch((error) => {
    elements.fileInput.setAttribute('aria-invalid', 'true');
    elements.fileStatus.textContent = `${error.message} Choose a JPG, PNG, or WebP image.`;
  });
});

elements.controls.addEventListener('reset', (event) => {
  event.preventDefault();
  elements.fileInput.value = '';
  elements.fileInput.removeAttribute('aria-invalid');
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
  const defaultCard = elements.sampleCards[0];
  selectCardButton(defaultCard);
  setMode('reencode');
  loadImage(defaultCard.dataset.cardSrc, `${defaultCard.dataset.cardName} loaded.`);
});

elements.copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(elements.apiCode.textContent);
    elements.copyButton.dataset.state = 'success';
    elements.copyButton.textContent = 'Copied';
  } catch {
    elements.copyButton.dataset.state = 'error';
    elements.copyButton.textContent = 'Copy failed';
  }

  window.setTimeout(() => {
    delete elements.copyButton.dataset.state;
    elements.copyButton.textContent = 'Copy code';
  }, 2500);
});

elements.themeToggle.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dusk'
    ? 'light'
    : 'dusk';
  setTheme(nextTheme, true);
});

const colourPreference = window.matchMedia('(prefers-color-scheme: dark)');
colourPreference.addEventListener('change', (event) => {
  try {
    if (localStorage.getItem(THEME_KEY)) return;
  } catch {
    // Follow the system preference when storage is unavailable.
  }
  setTheme(event.matches ? 'dusk' : 'light');
});

setTheme(document.documentElement.dataset.theme === 'dusk' ? 'dusk' : 'light');

const defaultCard = elements.sampleCards[0];
loadImage(defaultCard.dataset.cardSrc, `${defaultCard.dataset.cardName} loaded.`).catch((error) => {
  elements.fileStatus.textContent = `${error.message} Run the Astro site from the repository root.`;
});

window.requestAnimationFrame(() => {
  document.documentElement.classList.add('is-ready');
});
