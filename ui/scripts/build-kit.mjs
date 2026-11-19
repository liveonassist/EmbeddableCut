// SPDX-License-Identifier: MIT
//
// Packages the library build for hosts that vendor it rather than build it:
//
//   dist/kit/
//     kit.json      the revision it was built from and where its entries are
//     lib/          `vp build --mode lib`, served by the host as static files
//     types/        declarations for the UI's and the SDK's public API
//     schemas/      the JSON Schemas of the documents and edit operations
//
// The declarations use the sources' `@/`, `$lib/`, `$components/` and
// workspace package specifiers, which mean something else (or nothing) in a
// host. This rewrites them to relative paths, so `types/` stands alone.
//
// Run through `npm run build:kit`, which builds `dist/lib` first.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const uiDir = fileURLToPath(new URL('..', import.meta.url))
const repoDir = join(uiDir, '..')
const libDir = join(uiDir, 'dist/lib')
const kitDir = join(uiDir, 'dist/kit')
const typesDir = join(kitDir, 'types')

if (!existsSync(join(libDir, 'embeddablecut.js'))) {
  throw new Error('dist/lib is missing: run `vp build --mode lib` first (npm run build:kit does).')
}

rmSync(kitDir, { recursive: true, force: true })
cpSync(libDir, join(kitDir, 'lib'), { recursive: true })
cpSync(join(repoDir, 'schemas'), join(kitDir, 'schemas'), {
  recursive: true,
  filter: (path) => !path.endsWith('.md'),
})

// TypeScript 6 emits declarations; TypeScript 7 has no stable emit API yet
// (see scripts/svelte-check.mjs).
const tsc = createRequire(import.meta.url).resolve('typescript6/bin/tsc')
execFileSync(
  process.execPath,
  [tsc, '-p', join(uiDir, 'tsconfig.types.json'), '--declarationDir', typesDir],
  { stdio: 'inherit' },
)

// Each alias, and the emitted directories it may point into, in lookup order.
const aliases = [
  { prefix: '@/', roots: ['ui/src', 'engine/src'] },
  { prefix: '$lib/', roots: ['ui/src/lib'] },
  { prefix: '$components/', roots: ['ui/src/components'] },
  { prefix: '@embeddablecut/sdk/', roots: ['sdk/src'] },
  { prefix: '@embeddablecut/engine/', roots: ['engine/src'] },
]
const exact = new Map([['@embeddablecut/sdk', 'sdk/src/index']])

function declarationOf(target) {
  const stem = target.replace(/\.ts$/, '')
  for (const candidate of [stem, `${stem}/index`]) {
    if (existsSync(join(typesDir, `${candidate}.d.ts`))) return candidate
  }
  return null
}

function resolveAlias(specifier) {
  if (exact.has(specifier)) return declarationOf(exact.get(specifier))
  for (const { prefix, roots } of aliases) {
    if (!specifier.startsWith(prefix)) continue
    for (const root of roots) {
      const found = declarationOf(`${root}/${specifier.slice(prefix.length)}`)
      if (found) return found
    }
    return null
  }
  return undefined
}

// `from '…'`, `import('…')`, side-effect `import '…'` (tsc keeps them for
// modules that register things), and `declare module '…'`, whose
// augmentations would otherwise declare a module of their own in a host.
const specifierPattern =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bdeclare\s+module\s+)(['"])([^'"]+)\2/g
const unresolved = []

function rewrite(file) {
  const source = readFileSync(file, 'utf8')
  const fromDir = dirname(file)
  const output = source.replace(specifierPattern, (match, lead, quote, specifier) => {
    const target = resolveAlias(specifier)
    if (target === undefined) return match
    if (target === null) {
      unresolved.push(`${relative(typesDir, file)}: ${specifier}`)
      return match
    }
    let path = relative(fromDir, join(typesDir, target)).split(sep).join(posix.sep)
    if (!path.startsWith('.')) path = `./${path}`
    return `${lead}${quote}${path}${quote}`
  })
  if (output !== source) writeFileSync(file, output)
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.name.endsWith('.d.ts')) rewrite(path)
  }
}
walk(typesDir)

if (unresolved.length > 0) {
  throw new Error(`Declarations import modules that weren't emitted:\n  ${unresolved.join('\n  ')}`)
}

// One entry for hosts. The library bundle exports the UI's API at runtime; the
// SDK's is re-exported as types, for the `Editor` a mount hands back and the
// documents and operations it takes.
writeFileSync(
  join(typesDir, 'index.d.ts'),
  "export * from './ui/src/index'\nexport type * from './sdk/src/index'\n",
)

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const kit = {
  format: 'embeddablecut.kit',
  version: 1,
  revision: git('rev-parse', 'HEAD'),
  dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  entry: 'lib/embeddablecut.js',
  types: 'types/index.d.ts',
  schemas: 'schemas',
}
writeFileSync(join(kitDir, 'kit.json'), `${JSON.stringify(kit, null, 2)}\n`)
console.log(
  `kit: ${relative(repoDir, kitDir)} at ${kit.revision ?? 'unknown revision'}${kit.dirty ? ' (dirty)' : ''}`,
)
