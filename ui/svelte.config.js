// SPDX-License-Identifier: MIT

import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess({ script: false }),
  compilerOptions: { runes: true },
  vitePlugin: {
    // Libraries compile in the mode they were written for (lucide-svelte is
    // Svelte 4 syntax), and inject their component styles: Svelte appends
    // injected styles to the component's root node, so svelte-sonner's and
    // bits-ui's reach an editor mounted in a shadow root.
    dynamicCompileOptions: ({ filename }) =>
      filename.includes('/node_modules/') ? { runes: undefined, css: 'injected' } : undefined,
  },
}
