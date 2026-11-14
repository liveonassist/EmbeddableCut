#!/usr/bin/env node
// SPDX-License-Identifier: MIT

/**
 * Files what a merge from FreeCut left under src/ into engine/src or web/src.
 *
 * A file goes where its directory already lives. In a directory both packages
 * share, a component (`.tsx`), a hook, or anything importing React or the app's
 * UI kit belongs to the app; the rest is engine. `just check engine` then
 * catches an engine file that reaches into the app.
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

function destination(rel) {
  for (let dir = path.dirname(rel); dir !== '.'; dir = path.dirname(dir)) {
    const inEngine = fs.existsSync(path.join(ROOT, 'engine', 'src', dir))
    const inWeb = fs.existsSync(path.join(ROOT, 'web', 'src', dir))
    if (inEngine !== inWeb) return inEngine ? 'engine' : 'web'
    if (inEngine && inWeb) break
  }
  const source = fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8')
  if (rel.endsWith('.tsx') || /(^|\/)(hooks|components|contexts)\//.test(rel) || UI_IMPORT.test(source)) {
    return 'web'
  }
  return 'engine'
}

const files = walk(path.join(ROOT, 'src')).map((f) => path.relative(path.join(ROOT, 'src'), f))
for (const rel of files) {
  const pkg = destination(rel)
  const target = path.join(pkg, 'src', rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  execFileSync('git', ['mv', path.join('src', rel), target], { stdio: 'inherit' })
  console.log(`src/${rel} -> ${target}`)
}
if (files.length === 0) console.log('Nothing under src/ to place.')
