import {
  decodeImage,
  fingerprintImage,
  fingerprintPixels,
} from '/node_modules/image-fingerprint/lib/esm/browser.mjs';

self.addEventListener('message', async ({ data: { sources, encodedUrl } }) => {
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
    const response = await fetch(encodedUrl);
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
    self.postMessage({
      results: {
        rawPixels,
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
}, { once: true });
