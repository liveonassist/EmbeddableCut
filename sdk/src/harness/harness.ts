// SPDX-License-Identifier: MIT

/**
 * The headless harness page's entry (`headless.html`): installs the engine's
 * render API as `window.embeddablecut` for the Node/Playwright driver in `render/`.
 * Beyond FreeCut's API it loads extensions, so a server renders custom effects
 * and transitions exactly as the editor does, and reads project documents
 * under the same schema rules as the SDK.
 */

import { createLogger } from '@embeddablecut/engine/shared/logging/logger'
import {
  mediaFromAssetRecord,
  readProjectDocument,
  SCHEMA_VERSIONS,
  SchemaError,
} from '@embeddablecut/engine/schema/index'
import { editProject } from '@embeddablecut/engine/headless/edit'
import { editOperationNames } from '@embeddablecut/engine/headless/edit-ops'
import {
  createProjectForHeadless,
  dumpLayout,
  normalizeProjectForHeadless,
  probeMedia,
  renderFrame,
  renderProject,
  renderTimeline,
  type HeadlessMediaSource,
} from '@embeddablecut/engine/headless/main'
import { ExtensionHost, type Extension } from '../extensions'
import { SDK_VERSION } from '../version'

const log = createLogger('Headless')
const extensions = new ExtensionHost()

/**
 * Imports extension modules and installs what each exports by default: one
 * `Extension` or an array of them. Modules must be self-contained ES modules.
 */
async function installExtensions(urls: string[]): Promise<string[]> {
  const installed: string[] = []
  for (const url of urls) {
    const module = (await import(/* @vite-ignore */ url)) as { default?: Extension | Extension[] }
    const exported = module.default
    if (!exported) throw new Error(`Extension module ${url} has no default export`)
    for (const extension of Array.isArray(exported) ? exported : [exported]) {
      extensions.install(extension)
      installed.push(extension.id)
    }
  }
  return installed
}

type ReadDocumentResult =
  | {
      ok: true
      project: unknown
      /** URL assets, ready to render from. */
      remoteMedia: HeadlessMediaSource[]
      /** Assets whose bytes the driver supplies (from its workspace). */
      localAssetIds: string[]
      warnings: unknown[]
    }
  | { ok: false; code: string; message: string; issues?: unknown }

/** Reads a project document as the SDK does, refusing one this page can't render faithfully. */
function readDocument(input: unknown): ReadDocumentResult {
  try {
    const { document, warnings } = readProjectDocument(input)
    const missing = extensions.missing(document.requires)
    if (missing.length > 0) {
      return {
        ok: false,
        code: 'EXTENSION_MISSING',
        message: `The project needs ${missing.map((r) => `${r.kind} "${r.id}"`).join(', ')}, which this renderer has not installed`,
        issues: missing,
      }
    }
    const remoteMedia: HeadlessMediaSource[] = []
    const localAssetIds: string[] = []
    for (const asset of document.assets) {
      if (asset.source.type === 'url') {
        remoteMedia.push({
          mediaId: asset.id,
          url: asset.source.url,
          metadata: mediaFromAssetRecord(asset),
        })
      } else {
        localAssetIds.push(asset.id)
      }
    }
    return { ok: true, project: document.project, remoteMedia, localAssetIds, warnings }
  } catch (error) {
    if (error instanceof SchemaError) {
      return { ok: false, code: error.code, message: error.message, issues: error.issues }
    }
    throw error
  }
}

/** What this renderer can do, for the driver's capabilities and health. */
function describe() {
  return {
    sdkVersion: SDK_VERSION,
    schemaVersions: { ...SCHEMA_VERSIONS },
    operations: editOperationNames(),
    extensions: extensions.list().map((extension) => extension.id),
  }
}

interface EmbeddableCutHeadlessApi {
  ready: true
  renderTimeline: typeof renderTimeline
  renderProject: typeof renderProject
  renderFrame: typeof renderFrame
  dumpLayout: typeof dumpLayout
  editProject: typeof editProject
  normalizeProject: typeof normalizeProjectForHeadless
  probeMedia: typeof probeMedia
  createProject: typeof createProjectForHeadless
  installExtensions: typeof installExtensions
  readDocument: typeof readDocument
  describe: typeof describe
}

declare global {
  interface Window {
    embeddablecut: EmbeddableCutHeadlessApi
  }
}

window.embeddablecut = {
  ready: true,
  renderTimeline,
  renderProject,
  renderFrame,
  dumpLayout,
  editProject,
  normalizeProject: normalizeProjectForHeadless,
  probeMedia,
  createProject: createProjectForHeadless,
  installExtensions,
  readDocument,
  describe,
}
log.info('Headless harness ready')
