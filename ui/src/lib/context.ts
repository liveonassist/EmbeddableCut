// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'
import type { Editor } from '@embeddablecut/sdk'
import type { ContributionRegistry } from '../extensions/registry.svelte'
import type { FeatureGate } from '../extensions/feature-gate.svelte'
import type { HostActions } from '../extensions/actions.svelte'
import type { ThemeController } from '../theme/theme'

/** What every part of the editor UI can reach: the SDK editor, contributions, theme, portal target. */
export interface EditorUi {
  editor: Editor
  contributions: ContributionRegistry
  /** The host's feature switches; absent, every feature is on. */
  features?: FeatureGate
  /** What the host does in place of saving, exporting and help; absent, the editor's own. */
  actions?: HostActions
  theme: ThemeController
  /** Where popovers, menus and dialogs render: inside the editor's own root, never the host's body. */
  portalTarget: HTMLElement
}

const KEY = Symbol('embeddablecut.editor-ui')

export function setEditorUi(ui: EditorUi): void {
  setContext(KEY, ui)
}

/** @throws outside a mounted editor. */
export function getEditorUi(): EditorUi {
  const ui = getContext<EditorUi | undefined>(KEY)
  if (!ui) throw new Error('getEditorUi() outside a mounted editor')
  return ui
}

/** The editor UI, or null outside a mounted editor (tests, the app shell) or a component. */
export function findEditorUi(): EditorUi | null {
  try {
    return getContext<EditorUi | undefined>(KEY) ?? null
  } catch {
    // Hooks also run in effect roots of their own, where there's no context to read.
    return null
  }
}

/** The portal target, or the body when a component renders outside an editor (tests, the app shell). */
export function portalTarget(): HTMLElement {
  return getContext<EditorUi | undefined>(KEY)?.portalTarget ?? document.body
}
