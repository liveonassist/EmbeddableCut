#!/usr/bin/env node
// SPDX-License-Identifier: MIT

/**
 * Runs one of FreeCut's architecture checks against FreeCut's original layout.
 *
 * The checks (and their allowlists) are keyed on paths under a single `src/`.
 * EmbeddableCut splits that tree between `engine/src/` and `web/src/`, which
 * mirror it: every path exists in exactly one of them. This assembles the
 * union under `.cache/checks/` as real directories of hard-linked files (the
 * checks walk with `Dirent.isFile()`, which symlinks fail), beside the check
 * scripts and the configs they read, and runs the check there. Findings therefore
 * name `src/...` paths, as upstream's do, and upstream changes to the checks
 * and allowlists apply unchanged.
 *
 * usage: node scripts/checks/overlay.mjs <check-script.mjs> [args...]
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CHECKS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(CHECKS_DIR, '..', '..')
const OVERLAY = path.join(REPO_ROOT, '.cache', 'checks')
const SOURCE_ROOTS = ['engine/src', 'web/src'].map((root) => path.join(REPO_ROOT, root))

/** Hard-links every file of `sources` into `target`; later sources win a clash. */
function mergeInto(target, sources) {
  fs.mkdirSync(target, { recursive: true })
  const names = new Set(sources.flatMap((source) => fs.readdirSync(source)))
  for (const name of names) {
    const present = sources.map((source) => path.join(source, name)).filter((p) => fs.existsSync(p))
    const dirs = present.filter((p) => fs.statSync(p).isDirectory())
    if (dirs.length > 0) {
      if (dirs.length !== present.length) {
        throw new Error(`${name} is a file in one package and a directory in another: ${present}`)
      }
      mergeInto(path.join(target, name), dirs)
      continue
    }
    // Each package keeps its own copy of the test setup and ambient types; the
    // app's is the one FreeCut had.
    fs.linkSync(present.at(-1), path.join(target, name))
  }
}

const [script, ...args] = process.argv.slice(2)
if (!script) {
  console.error('usage: node scripts/checks/overlay.mjs <check-script.mjs> [args...]')
  process.exit(2)
}

fs.rmSync(OVERLAY, { recursive: true, force: true })
mergeInto(path.join(OVERLAY, 'src'), SOURCE_ROOTS)
mergeInto(path.join(OVERLAY, 'scripts'), [CHECKS_DIR])
mergeInto(path.join(OVERLAY, 'headless'), [path.join(REPO_ROOT, 'render')])
fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(OVERLAY, 'node_modules'))
fs.linkSync(path.join(REPO_ROOT, '.fallowrc.json'), path.join(OVERLAY, '.fallowrc.json'))
// Fallow finds entry points and test files through the app's Vite config and HTML.
for (const file of ['vite.config.ts', 'index.html', 'headless.html', 'tsr.config.json']) {
  fs.linkSync(path.join(REPO_ROOT, 'web', file), path.join(OVERLAY, file))
}
fs.writeFileSync(
  path.join(OVERLAY, 'tsconfig.json'),
  JSON.stringify({ extends: '../../web/tsconfig.json', compilerOptions: { paths: { '@/*': ['./src/*'] } }, include: ['src'] }),
)
fs.writeFileSync(
  path.join(OVERLAY, 'package.json'),
  JSON.stringify({ name: 'freecut-layout', private: true, type: 'module', scripts: Object.fromEntries(
    fs.readdirSync(CHECKS_DIR).filter((f) => /^(check|report)-.*\.mjs$/.test(f)).map((f) => [f, `node scripts/${f}`]),
  ), dependencies: {
    ...JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'engine', 'package.json'), 'utf8')).dependencies,
    ...JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'web', 'package.json'), 'utf8')).dependencies,
  } }),
)

const result = spawnSync(process.execPath, [path.join(CHECKS_DIR, script), ...args], {
  cwd: OVERLAY,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
