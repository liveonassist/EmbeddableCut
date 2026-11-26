// SPDX-License-Identifier: MIT

/**
 * Mounting the whole FreeCut app — landing page, projects, docs, changelog and
 * the editor — into a page, as the web app does. The SDK editor is created on
 * the workspace folder the workspace gate is granted.
 */

import { mount, unmount } from 'svelte'
import type { Editor } from '@embeddablecut/sdk'
import { i18nReady } from '@/i18n'
import { setWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root'
import { createLogger } from '@/shared/logging/logger'
import type { EditorUi } from '$lib/context'
import { ContributionRegistry } from '../extensions/registry.svelte'
import { createEditorShell } from '../embed/shell'
import { ensureEditorFonts } from '../embed/fonts'
import App from './app.svelte'

const logger = createLogger('WorkspaceGate')

// The SDK carries the whole engine, which the landing page, docs and
// changelog never use, so it loads with the first workspace.
const loadSdk = () => import('@embeddablecut/sdk')

export interface MountedApp {
  /** Removes the app and disposes its editor, so another can be mounted. */
  unmount(): Promise<void>
}

/**
 * Mounts the app into `target`, sharing the page's styles (import
 * `@embeddablecut/ui/styles.css` in the page), as FreeCut's app renders. Only
 * one app or editor runs in a page at a time.
 */
export async function mountApp(target: HTMLElement): Promise<MountedApp> {
  // The gate's workspace routes open the editor at once: fetch it with the
  // app, not after the gate's storage checks.
  if (/^\/(projects|editor)/.test(window.location.pathname)) loadSdk().catch(() => {})
  await i18nReady
  ensureEditorFonts()
  const shell = createEditorShell(target, { isolation: 'none', theme: 'dark', layout: 'page' })

  let editor: Editor | null = null
  let contributions: ContributionRegistry | null = null
  let workspace: FileSystemDirectoryHandle | null = null

  // Routes that need the editor render only behind the gate, after a
  // workspace has opened; the landing page, docs and changelog never reach it.
  const ui: EditorUi = {
    get editor() {
      if (!editor) throw new Error('The editor opens with the workspace')
      return editor
    },
    get contributions() {
      if (!contributions) throw new Error('The editor opens with the workspace')
      return contributions
    },
    theme: shell.themes,
    portalTarget: shell.portalTarget,
  }

  function closeEditor() {
    contributions?.dispose()
    contributions = null
    editor?.dispose()
    editor = null
    if (workspace) setWorkspaceRoot(null)
    workspace = null
  }

  async function openWorkspace(handle: FileSystemDirectoryHandle): Promise<void> {
    // The gate activates again on every return to a workspace route, and on
    // reconnecting: the editor already on this folder stays.
    if (editor && workspace && (await workspace.isSameEntry(handle))) return
    closeEditor()
    const { createEditor } = await loadSdk()
    try {
      editor = await createEditor({ workspace: handle })
    } catch (error) {
      // As FreeCut's gate: a workspace that fails to bootstrap still opens.
      logger.warn('bootstrapWorkspace failed', error)
      editor = await createEditor()
      setWorkspaceRoot(handle)
    }
    workspace = handle
    contributions = new ContributionRegistry(editor)
  }

  if (import.meta.env.DEV) {
    // Debug utilities are editor-heavy; keep them out of the production startup graph.
    void import('./debug').then(({ initializeDebugUtils }) => initializeDebugUtils())
  }

  const app = mount(App, { target: shell.root, props: { ui, openWorkspace } })

  return {
    async unmount() {
      await unmount(app)
      closeEditor()
      shell.dispose()
    },
  }
}
