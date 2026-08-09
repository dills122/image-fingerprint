import { runBrowserWorkload } from './browser-performance-workload.mjs';

self.onmessage = async event => {
  try {
    self.postMessage({ ok: true, result: await runBrowserWorkload(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
    });
  }
};
