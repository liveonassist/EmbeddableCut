// SPDX-License-Identifier: MIT

import { defineConfig, lazyPlugins, type Plugin } from 'vite-plus'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const oxlintConfig = JSON.parse(readFileSync(new URL('../.oxlintrc.json', import.meta.url), 'utf8'))
const oxfmtConfig = JSON.parse(readFileSync(new URL('../.oxfmtrc.json', import.meta.url), 'utf8'))
const toolIgnorePatterns = ['coverage/**', 'dist/**']

// `@/` resolves against the UI's own sources first, then the engine's, so a
// component ported from the React app keeps its import specifiers.
const sourceRoots = [
  fileURLToPath(new URL('./src', import.meta.url)),
  fileURLToPath(new URL('../engine/src', import.meta.url)),
]

function layeredSourceAliasPlugin(): Plugin {
  return {
    name: 'embeddablecut-layered-source-alias',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.startsWith('@/')) return null
      for (const root of sourceRoots) {
        const resolved = await this.resolve(join(root, source.slice(2)), importer, {
          ...options,
          skipSelf: true,
        })
        if (resolved) return resolved
      }
      return null
    },
  }
}

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
  plugins: lazyPlugins(() => [layeredSourceAliasPlugin(), svelte(), tailwindcss()]),
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      $components: fileURLToPath(new URL('./src/components', import.meta.url)),
    },
    conditions: process.env.VITEST ? ['browser'] : [],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
