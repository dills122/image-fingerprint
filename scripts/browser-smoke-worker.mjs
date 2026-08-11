import {
  decodeImage,
  fingerprintImage,
  fingerprintPixels,
} from '/node_modules/image-fingerprint/lib/esm/browser.mjs';
import {
  compareCropLocalSourceToCrop,
  comparePackedCropLocalSourceToCrop,
  fingerprintCropLocalItem,
  packCropLocalItemFingerprint,
} from '/node_modules/image-fingerprint/lib/esm/experimental/crop-local.mjs';
import {
  runCropLocalBrowserFixtures,
} from '/scripts/browser-smoke-crop-local-fixtures.mjs';

const gray = [
  0, 41, 82, 123, 164,
  13, 54, 95, 136, 177,
  26, 67, 108, 149, 190,
  39, 80, 121, 162, 203,
  52, 93, 134, 175, 216,
];
const sources = {
  gray8: gray,
  rgb8: gray.flatMap((value) => [value, value, value]),
  rgba8: gray.flatMap((value) => [value, value, value, 255]),
};

try {
  const options = { algorithm: 'pdq-v1' };
  const rawPixels = Object.fromEntries(Object.entries(sources).map(([format, data]) => [
    format,
    fingerprintPixels({
      format,
      width: 5,
      height: 5,
      data: Uint8Array.from(data),
    }, options),
  ]));
  const imageData = new ImageData(Uint8ClampedArray.from(sources.rgba8), 5, 5);
  const response = await fetch('/scripts/Example.png');
  if (!response.ok) throw new Error(`fixture request failed: ${response.status}`);
  const blob = await response.blob();
  const file = new File([blob], 'Example.png', { type: 'image/png' });
  const decoded = await decodeImage(blob);
  const decodedFingerprint = fingerprintPixels(decoded, options);
  const [imageDataFingerprint, blobFingerprint, fileFingerprint] = await Promise.all([
    fingerprintImage(imageData, options),
    fingerprintImage(blob, options),
    fingerprintImage(file, options),
  ]);
  const cropLocal = runCropLocalBrowserFixtures({
    compareCropLocalSourceToCrop,
    comparePackedCropLocalSourceToCrop,
    fingerprintCropLocalItem,
    packCropLocalItemFingerprint,
  });
  self.postMessage({
    results: {
      rawPixels,
      cropLocal,
      adapters: {
        imageData: imageDataFingerprint,
        blob: blobFingerprint,
        file: fileFingerprint,
        decodedPixels: decodedFingerprint,
        width: decoded.width,
        height: decoded.height,
      },
    },
  });
} catch (error) {
  self.postMessage({
    error: error instanceof Error ? error.message : String(error),
  });
}
