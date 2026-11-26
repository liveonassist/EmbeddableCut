import { defaultClientConditions, defineConfig, lazyPlugins } from 'vite-plus'
import type { Plugin } from 'vite-plus'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The app is the editor UI's: `@/` resolves against its sources first, then
// the engine's, which together mirror FreeCut's original `src/` layout.
const sourceRoots = [
  fileURLToPath(new URL('../ui/src', import.meta.url)),
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

// EmbeddableCut: what the headless harness shares with the app. `manualChunks`
// runs as one chunk group, which takes each module's dependencies with it, so
// these landed in whichever UI chunk reached them first and the harness loaded
// 780 KB of editor UI for a logger and two caches. Groups ahead of it claim
// them, apart, so the landing page doesn't load what only rendering uses.
const sharedChunks = [
  {
    name: 'core-shared',
    modules: [
      '/src/shared/logging/logger.ts',
      '/src/infrastructure/browser/blob-url-manager.ts',
      'vite/preload-helper',
    ],
  },
  {
    name: 'render-shared',
    modules: [
      '/src/shared/utils/media-utils.ts',
      '/src/features/timeline/services/gif-frame-cache.ts',
    ],
  },
]

function sharedChunksPlugin(): Plugin {
  return {
    name: 'embeddablecut-shared-chunks',
    apply: 'build',
    outputOptions(options) {
      const { manualChunks, ...rest } = options
      if (typeof manualChunks !== 'function') return null
      const groups = sharedChunks.map(({ name, modules }) => ({
        name,
        priority: 1,
        // Their dependencies stay where the app puts them.
        includeDependenciesRecursively: false,
        test: (id: string) => modules.some((path) => id.replaceAll('\\', '/').includes(path)),
      }))
      return { ...rest, codeSplitting: { groups: [...groups, { name: manualChunks }] } }
    },
  }
}

// Stamps public/sw.js with the hashed entry-chunk filename at build time so the service
// worker's CACHE_VERSION — and the sw.js bytes — change on every deploy. Without this the
// SW file is byte-identical across deploys, so registration.update() never detects a new
// version and old cached chunks are never purged. Uses the content hash (not a timestamp)
// so identical builds produce an identical SW and avoid needless update churn.
function serviceWorkerVersionPlugin(): Plugin {
  const placeholder = '__EMBEDDABLECUT_BUILD_ID__'
  let buildId = ''

  return {
    name: 'embeddablecut-sw-version',
    apply: 'build',
    writeBundle(options, bundle) {
      const mainEntry = Object.values(bundle).find(
        (output) => output.type === 'chunk' && output.isEntry && output.name === 'main',
      )
      buildId =
        mainEntry && mainEntry.type === 'chunk'
          ? mainEntry.fileName.replace(/[^a-zA-Z0-9]/g, '-')
          : buildId
    },
    // closeBundle runs after Vite has copied publicDir into the out dir, so dist/sw.js
    // exists here with the placeholder intact.
    closeBundle() {
      if (!buildId) {
        this.warn('serviceWorkerVersionPlugin: no main entry chunk found; sw.js not stamped')
        return
      }
      const swPath = join(fileURLToPath(new URL('./dist', import.meta.url)), 'sw.js')
      const source = readFileSync(swPath, 'utf8')
      if (!source.includes(placeholder)) {
        return
      }
      writeFileSync(swPath, source.replaceAll(placeholder, buildId))
    },
  }
}

const oxlintConfig = JSON.parse(readFileSync(new URL('../.oxlintrc.json', import.meta.url), 'utf8'))
const oxfmtConfig = JSON.parse(readFileSync(new URL('../.oxfmtrc.json', import.meta.url), 'utf8'))
const toolIgnorePatterns = [
  'dist/**',
  'coverage/**',
  'public/**',
  'tmp/**',
  'output/**',
  'scripts/**',
]

// https://vite.dev/config/
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
  plugins: lazyPlugins(() => [
    layeredSourceAliasPlugin(),
    svelte({ configFile: fileURLToPath(new URL('../ui/svelte.config.js', import.meta.url)) }),
    tailwindcss(),
    serviceWorkerVersionPlugin(),
    sharedChunksPlugin(),
  ]),
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('../ui/src/lib', import.meta.url)),
      $components: fileURLToPath(new URL('../ui/src/components', import.meta.url)),
    },
    dedupe: ['svelte'],
    // onnxruntime-web without the wasm inlined, as in ui/vite.config.ts.
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: ['..'],
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      // Enables the JS self-profiling API (new Profiler(...)) for dev-time
      // performance investigation, e.g. profiling play-start latency.
      'Document-Policy': 'js-profiling',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    // @mediabunny/ac3 is an intentionally large lazy decoder bundle (~1.1 MB minified).
    // Keep warnings focused on unexpected growth rather than this known outlier.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // Multi-entry: the editor app (index.html) plus the headless render
      // harness (headless.html), a UI-less entry that exposes window.embeddablecut
      // for the Node/Playwright headless render+edit CLI.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        headless: fileURLToPath(new URL('./headless.html', import.meta.url)),
      },
      output: {
        manualChunks: (id) => {
          const normalizedId = id.replaceAll('\\', '/')
          const isWorkspaceGateShell =
            normalizedId.endsWith('/src/features/workspace-gate/workspace-gate.svelte') ||
            normalizedId.endsWith('/src/features/workspace-gate/workspace-gate-splash.svelte') ||
            normalizedId.endsWith('/src/features/workspace-gate/use-pathname.svelte.ts')
          const isAppShellComponent =
            normalizedId.endsWith('/src/components/brand/embeddablecut-logo.svelte') ||
            normalizedId.includes('/src/components/ui/accordion/') ||
            normalizedId.includes('/src/components/ui/button/') ||
            normalizedId.endsWith('/src/components/ui/button-variants.ts') ||
            normalizedId.includes('/src/components/ui/global-tooltip/') ||
            // TooltipProvider wraps the whole app in App, so the tooltip
            // primitive must live in the shell. Without this pin, the chunker
            // places it in feature-editing-core (majority importer) and the
            // entire 1.2MB editor chunk loads on the landing page.
            normalizedId.includes('/src/components/ui/tooltip/') ||
            // EmbeddableCut: the app root mounts the toaster and the theme
            // shell sets the hotkey scope. A group takes its modules'
            // dependencies with it, so left unpinned these land in
            // feature-editing-core and the landing page loads all of it.
            normalizedId.includes('/src/components/ui/sonner/') ||
            normalizedId.includes('/node_modules/svelte-sonner/') ||
            normalizedId.includes('/src/shared/notifications/') ||
            normalizedId.endsWith('/src/lib/hotkeys.svelte.ts') ||
            normalizedId.endsWith('/src/app/route-error.svelte')

          // Logger must be in its own chunk to avoid circular chunk TDZ errors.
          // Without this, Rollup places it in composition-runtime which has a
          // circular import with media-library, causing "Cannot access before
          // initialization" in production builds.
          if (normalizedId.endsWith('/src/shared/logging/logger.ts')) {
            return 'core-logger'
          }

          if (
            isAppShellComponent ||
            (normalizedId.includes('/src/routes/') && !normalizedId.includes('.lazy.')) ||
            normalizedId.includes('/src/app/error-boundary') ||
            normalizedId.includes('/src/app/pwa-install-prompt') ||
            isWorkspaceGateShell ||
            (normalizedId.includes('/src/i18n/') && !normalizedId.includes('/src/i18n/locales/'))
          ) {
            return 'app-shell'
          }

          // Timeline bridge modules that re-export UI must live with the UI
          // chunk; otherwise core ends up importing UI, which creates a
          // feature-editing-core <-> feature-editing-ui TDZ cycle at startup.
          if (normalizedId.includes('/src/features/timeline/index.ts')) {
            return 'feature-editing-ui'
          }

          // Application feature chunks
          if (normalizedId.includes('/src/infrastructure/gpu-effects/')) {
            return 'gpu-effects'
          }
          if (
            normalizedId.includes('/src/features/media-library/services/media-library-service') ||
            normalizedId.includes('/src/features/media-library/services/file-access')
          ) {
            return 'media-library-service'
          }
          if (
            normalizedId.includes('/src/features/media-library/services/media-analysis-service') ||
            normalizedId.includes('/src/features/media-library/deps/analysis')
          ) {
            return 'media-analysis'
          }
          if (
            normalizedId.includes('/src/features/timeline/components/clip-filmstrip') ||
            normalizedId.includes('/src/features/timeline/components/clip-waveform') ||
            normalizedId.includes('/src/features/timeline/hooks/use-filmstrip') ||
            normalizedId.includes('/src/features/timeline/hooks/use-gif-frames') ||
            normalizedId.includes('/src/features/timeline/hooks/use-waveform') ||
            normalizedId.includes('/src/features/timeline/services/filmstrip-cache') ||
            normalizedId.includes('/src/features/timeline/services/filmstrip-storage') ||
            normalizedId.includes('/src/features/timeline/services/waveform-cache') ||
            normalizedId.includes('/src/features/timeline/services/waveform-opfs-storage') ||
            normalizedId.includes('/src/features/timeline/services/gif-frame-cache') ||
            normalizedId.includes('/src/features/timeline/utils/compound-clip-waveform')
          ) {
            return 'timeline-media-visuals'
          }
          if (
            normalizedId.includes('/src/features/timeline/components/keyframe-graph-panel') ||
            normalizedId.includes('/src/features/timeline/deps/keyframe-editors') ||
            normalizedId.includes('/src/features/keyframes/components/dopesheet-editor') ||
            normalizedId.includes('/src/features/keyframes/components/value-graph-editor')
          ) {
            return 'timeline-keyframe-graph'
          }
          if (
            normalizedId.includes('/src/features/timeline/components/bento-layout-dialog') ||
            normalizedId.includes('/src/features/timeline/components/reverse-conform-dialog') ||
            normalizedId.includes('/src/features/timeline/components/silence-removal-dialog') ||
            normalizedId.includes('/src/features/timeline/components/filler-removal-dialog')
          ) {
            return 'timeline-dialogs'
          }
          if (
            normalizedId.includes('/src/features/timeline/') ||
            normalizedId.includes('/src/features/media-library/')
          ) {
            if (normalizedId.includes('/components/')) {
              return 'feature-editing-ui'
            }
            return 'feature-editing-core'
          }
          if (normalizedId.includes('/src/features/effects/')) {
            return 'feature-effects'
          }
          // `src/runtime/composition-runtime/**` deliberately has no rule here.
          // A rule pinning it to `feature-editing-core` used to exist but matched
          // a path the code no longer lives at, so it was inert; the current
          // graph has no chunk cycle to break (feature-editing-core imports only
          // rolldown-runtime and app-shell), while re-pinning it would move ~130
          // modules into that 1.6MB chunk.

          if (normalizedId.includes('/node_modules/svelte/')) {
            return 'svelte-vendor'
          }
          if (normalizedId.includes('/node_modules/svelte-sonner/')) {
            return 'toast-vendor'
          }
          // State management
          if (normalizedId.includes('/node_modules/zustand/')) {
            return 'state-vendor'
          }
          // Media processing - loaded on demand
          if (normalizedId.includes('/node_modules/@mediabunny/ac3/')) {
            return 'media-ac3-decoder'
          }
          if (normalizedId.includes('/node_modules/@mediabunny/mp3-encoder/')) {
            return 'media-mp3-encoder'
          }
          if (normalizedId.includes('/node_modules/mediabunny/')) {
            return 'media-bunny-core'
          }
          if (normalizedId.includes('/node_modules/@mediabunny/')) {
            return 'media-processing'
          }
          // Audio/video processing helpers
          if (normalizedId.includes('/node_modules/gifuct-js/')) {
            return 'gif-processing'
          }
          // UI framework
          if (
            normalizedId.includes('/node_modules/bits-ui/') ||
            normalizedId.includes('/node_modules/@floating-ui/') ||
            normalizedId.includes('/node_modules/paneforge/')
          ) {
            return 'vendor-ui'
          }
          // EmbeddableCut: no icon chunk. The by-name barrel put all 1,400
          // icons in it, so one icon on the error screen loaded 660 KB.
          return undefined
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: [
      'mediabunny',
      '@mediabunny/ac3',
      '@mediabunny/mp3-encoder',
      '@mediabunny/aac-encoder',
      '@huggingface/transformers',
    ],
  },
})
