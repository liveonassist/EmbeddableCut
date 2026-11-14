// SPDX-License-Identifier: MIT
//
// Runs svelte-check against TypeScript 6. The workspace pins TypeScript 7
// (the native compiler, for oxlint's type-aware rules), which has no
// language service API; svelte-check needs one. TypeScript 6 is installed
// as `typescript6`, and this resolves `typescript` to it for svelte-check
// alone.
import { registerHooks } from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const typescript6 = require.resolve('typescript6')

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'typescript') return { url: new URL(`file://${typescript6}`).href, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

process.argv = [
  process.argv[0],
  'svelte-check',
  '--tsconfig',
  fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
  '--threshold',
  'error',
  ...process.argv.slice(2),
]
await import('svelte-check')
