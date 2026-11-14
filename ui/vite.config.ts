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

// `vp build` builds the editor page iframes load (`embed.html`);
// `vp build --mode lib` builds the library hosts import (`mountEditor`, ...),
// with the editor's stylesheet inside it.
const libraryBuild = process.argv.includes('lib')

export default defineConfig({
  lint: {
    ...oxlintConfig,
    // React's rules read Svelte's runes and mutable refs as render-time code.
    plugins: [],
    rules: {
      ...Object.fromEntries(
        Object.entries(oxlintConfig.rules ?? {}).filter(([rule]) => !rule.startsWith('react/')),
      ),
      // The UI is Svelte: React and its libraries have Svelte counterparts
      // (ui/AGENTS.md), and zustand's React entries import React.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'zustand', message: 'Use `create` from @/shared/state/bound-store.' },
            { name: 'zustand/shallow', message: 'Use `shallow` from $lib/store.svelte.' },
            { name: 'sonner', message: 'Use svelte-sonner.' },
          ],
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-*',
                '@radix-ui/*',
                'lucide-react',
                '@tanstack/react-*',
                'zustand/react*',
              ],
              message: 'The UI is Svelte; see the porting table in ui/AGENTS.md.',
            },
          ],
        },
      ],
    },
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
    // Vitest resolves for the server by default; Svelte's client runtime needs the browser entries.
    ...(process.env.VITEST ? { conditions: ['browser'] } : {}),
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
  // The editor page is served wherever a host puts it, so it loads its assets relatively.
  base: './',
  build: libraryBuild
    ? {
        target: 'esnext',
        outDir: 'dist/lib',
        sourcemap: true,
        lib: {
          entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
          formats: ['es'],
          fileName: 'embeddablecut',
        },
      }
    : {
        target: 'esnext',
        outDir: 'dist/embed',
        sourcemap: true,
        rollupOptions: {
          input: { embed: fileURLToPath(new URL('./embed.html', import.meta.url)) },
        },
      },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
