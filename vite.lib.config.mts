import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        browser: path.resolve(rootDirectory, 'src/browser.ts'),
        core: path.resolve(rootDirectory, 'src/core/index.ts'),
        'experimental/crop-local': path.resolve(
          rootDirectory,
          'src/experimental/crop-local.ts',
        ),
      },
      fileName: (_format, entryName) => `${entryName}.mjs`,
      formats: ['es'],
    },
    minify: false,
    outDir: 'lib/esm',
    sourcemap: true,
  },
});
