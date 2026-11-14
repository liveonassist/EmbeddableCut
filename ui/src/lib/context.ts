// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'
import type { Editor } from '@embeddablecut/sdk'
import type { ContributionRegistry } from '../extensions/registry.svelte'
import type { ThemeController } from '../theme/theme'

/** What every part of the editor UI can reach: the SDK editor, contributions, theme, portal target. */
export interface EditorUi {
  editor: Editor
  contributions: ContributionRegistry
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

/** The portal target, or the body when a component renders outside an editor (tests, the app shell). */
export function portalTarget(): HTMLElement {
  return getContext<EditorUi | undefined>(KEY)?.portalTarget ?? document.body
}
