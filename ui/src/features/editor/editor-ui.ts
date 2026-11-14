// SPDX-License-Identifier: MIT

import { getEditorUi, type EditorUi } from '$lib/context'

/**
 * The mounted editor's UI context, or null when a component renders outside
 * one (its own tests). Call it while the component initializes, like
 * `getEditorUi`; host contributions render only when there is one.
 */
export function maybeEditorUi(): EditorUi | null {
  try {
    return getEditorUi()
  } catch {
    return null
  }
}
