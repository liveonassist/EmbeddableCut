#!/usr/bin/env node
// SPDX-License-Identifier: MIT

/**
 * Files what a merge from FreeCut left under src/: engine code into
 * engine/src, and FreeCut's React UI listed for porting into ui/src.
 *
 * A file goes where its directory already lives. In a directory both packages
 * share, a component (`.tsx`), a hook, or anything importing React or the
 * React UI kit is UI; the rest is engine. `just check engine` then catches an
 * engine file that reaches into the UI.
 *
 * UI files stay where the merge left them: under src/ (a new React file, or
 * upstream's version of one the Svelte UI replaced, which a modify/delete
 * conflict leaves there), or as a .tsx under ui/src, where git's directory
 * rename detection files a React file added beside ported ones. Each is
 * ported into its twin under ui/src (docs/UPSTREAM.md), then removed.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const UI_IMPORT = /from\s+['"](react|react-dom|@radix-ui\/[^'"]+|lucide-react|@tanstack\/react-[^'"]+|react-[^'"]+|motion|sonner)['"]/

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function isUi(rel) {
  for (let dir = path.dirname(rel); dir !== '.'; dir = path.dirname(dir)) {
    const inEngine = fs.existsSync(path.join(ROOT, 'engine', 'src', dir))
    const inUi = fs.existsSync(path.join(ROOT, 'ui', 'src', dir))
    if (inEngine !== inUi) return inUi
    if (inEngine && inUi) break
  }
  const source = fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8')
  return rel.endsWith('.tsx') || /(^|\/)(hooks|components|contexts)\//.test(rel) || UI_IMPORT.test(source)
}

/** The Svelte port of a React file: same path, as a component, hook, module or folder. */
function uiTwin(rel) {
  const stem = rel.replace(/\.(tsx|ts)$/, '')
  const candidates = [`${stem}.svelte`, `${stem}.svelte.ts`, `${stem}.ts`, `${stem}.svelte.test.ts`, stem]
  return candidates.map((c) => path.join('ui', 'src', c)).find((c) => fs.existsSync(path.join(ROOT, c)))
}

const files = walk(path.join(ROOT, 'src')).map((f) => path.relative(path.join(ROOT, 'src'), f))
const toPort = []
for (const rel of files) {
  if (isUi(rel)) {
    toPort.push(rel)
    continue
  }
  const target = path.join('engine', 'src', rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  execFileSync('git', ['mv', path.join('src', rel), target], { stdio: 'inherit' })
  console.log(`src/${rel} -> ${target}`)
}
const placedInUi = walk(path.join(ROOT, 'ui', 'src'))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => path.relative(path.join(ROOT, 'ui', 'src'), f))
if (toPort.length > 0 || placedInUi.length > 0) {
  console.log('\nFreeCut UI to port into ui/src, then `git rm` the React file:')
  for (const rel of toPort) console.log(`  src/${rel} -> ${uiTwin(rel) ?? `ui/src/${rel} (new)`}`)
  for (const rel of placedInUi) console.log(`  ui/src/${rel} -> ${uiTwin(rel) ?? 'its .svelte beside it (new)'}`)
} else if (files.length === 0) {
  console.log('Nothing to place or port.')
}
