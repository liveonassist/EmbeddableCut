// SPDX-License-Identifier: MIT

import { defineConfig } from 'vite-plus'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const oxlintConfig = JSON.parse(readFileSync(new URL('../.oxlintrc.json', import.meta.url), 'utf8'))
const oxfmtConfig = JSON.parse(readFileSync(new URL('../.oxfmtrc.json', import.meta.url), 'utf8'))
const toolIgnorePatterns = ['coverage/**', 'dist/**']

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
    globals: true,
    environment: 'jsdom',
    setupFiles: ['../engine/src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // The engine is consumed as source, and its modules import each other
      // through its own `@/` alias. The SDK's code never uses `@/` itself.
      '@': fileURLToPath(new URL('../engine/src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
})
