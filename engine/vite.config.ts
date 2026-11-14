// SPDX-License-Identifier: MIT

import { defineConfig } from 'vite-plus'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The engine ships as source: hosts bundle it, so this config only drives
// lint, format and tests.
const oxlintConfig = JSON.parse(readFileSync(new URL('../.oxlintrc.json', import.meta.url), 'utf8'))
const oxfmtConfig = JSON.parse(readFileSync(new URL('../.oxfmtrc.json', import.meta.url), 'utf8'))
const toolIgnorePatterns = ['coverage/**', 'tmp/**', 'output/**']

export default defineConfig({
  lint: {
    ...oxlintConfig,
    ignorePatterns: toolIgnorePatterns,
    options: {
      ...(oxlintConfig.options ?? {}),
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ...oxfmtConfig,
    ignorePatterns: toolIgnorePatterns,
  },
  test: {
    // Preserve Vitest 4's mock history; adopt Vitest 5 clearing separately.
    clearMocks: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Ratchet floor, not a target: set just below measured coverage so CI
      // fails on regressions. Raise these as coverage grows.
      thresholds: {
        statements: 48,
        branches: 42,
        functions: 52,
        lines: 49,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
})
