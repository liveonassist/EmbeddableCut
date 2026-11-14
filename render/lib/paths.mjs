// SPDX-License-Identifier: MIT

import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The render package's own directory. */
const RENDER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The monorepo root. */
const REPO_ROOT = path.resolve(RENDER_DIR, '..')

/**
 * The built harness (`headless.html` and its assets). Packaged installs point
 * `EMBEDDABLECUT_HARNESS_DIR` at their copy; a checkout uses the web build.
 */
export const HARNESS_DIST = process.env.EMBEDDABLECUT_HARNESS_DIR
  ? path.resolve(process.env.EMBEDDABLECUT_HARNESS_DIR)
  : path.join(REPO_ROOT, 'web', 'dist')
