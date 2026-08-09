import { fingerprintPixels } from '/node_modules/image-fingerprint/lib/esm/browser.mjs';

self.addEventListener('message', ({ data: sources }) => {
  try {
    const results = Object.fromEntries(Object.entries(sources).map(([format, data]) => [
      format,
      fingerprintPixels({
        format,
        width: 5,
        height: 5,
        data: Uint8Array.from(data),
      }, {
        algorithm: 'pdq-v1',
      }),
    ]));
    self.postMessage({ results });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}, { once: true });
