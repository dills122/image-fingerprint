// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: [
      '.codex/**',
      'coverage/**',
      'lib/**',
      'node_modules/**',
    ],
  },
  {
    name: 'image-fingerprint/typescript',
    files: [
      'src/**/*.ts',
      '__tests__/**/*.ts',
      '*.config.{ts,mts}',
    ],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
]);
