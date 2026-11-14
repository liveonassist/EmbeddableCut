// SPDX-License-Identifier: MIT

/**
 * The headless harness page's entry: installs the render API from `main.ts`
 * as `window.freecut` for the Node/Playwright driver. Kept apart from the API
 * so an SDK host can render with it without a global appearing in its page.
 */

import { createLogger } from '@/shared/logging/logger'
import { editProject } from './edit'
import {
  createProjectForHeadless,
  dumpLayout,
  normalizeProjectForHeadless,
  probeMedia,
  renderFrame,
  renderProject,
  renderTimeline,
} from './main'

const log = createLogger('Headless')

interface FreecutHeadlessApi {
  ready: true
  renderTimeline: typeof renderTimeline
  renderProject: typeof renderProject
  renderFrame: typeof renderFrame
  dumpLayout: typeof dumpLayout
  editProject: typeof editProject
  normalizeProject: typeof normalizeProjectForHeadless
  probeMedia: typeof probeMedia
  createProject: typeof createProjectForHeadless
}

declare global {
  interface Window {
    freecut: FreecutHeadlessApi
  }
}

window.freecut = {
  ready: true,
  renderTimeline,
  renderProject,
  renderFrame,
  dumpLayout,
  editProject,
  normalizeProject: normalizeProjectForHeadless,
  probeMedia,
  createProject: createProjectForHeadless,
}
log.info('Headless harness ready')
