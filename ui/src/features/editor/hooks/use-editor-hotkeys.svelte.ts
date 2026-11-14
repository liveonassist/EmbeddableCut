// SPDX-License-Identifier: MIT

import { useHotkeys } from '$lib/hotkeys.svelte'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import { useResolvedHotkeys } from '@/features/editor/deps/settings'
import { useEditorStore } from '@/shared/state/editor'

import { useSceneBrowserStore } from '@/features/editor/deps/scene-browser'

interface EditorHotkeyCallbacks {
  onSave?: () => void
  onExport?: () => void
}

/**
 * Global editor keyboard shortcuts
 *
 * Handles editor-level shortcuts that work across all components:
 * - Save (Ctrl+S) - Saves timeline to project
 * - Export (Ctrl+Shift+E) - Exports video
 * - Open Scene Browser (Ctrl+Shift+F) - Opens caption search across media
 *
 * Note: Undo/Redo are handled in useTimelineShortcuts since they're timeline-specific
 */
export function useEditorHotkeys(callbacks: () => EditorHotkeyCallbacks = () => ({})): void {
  const hotkeys = useResolvedHotkeys()

  // Save: Cmd/Ctrl+S
  useHotkeys(
    () => hotkeys.current.SAVE,
    (event) => {
      event.preventDefault()
      callbacks().onSave?.()
    },
    HOTKEY_OPTIONS,
  )

  // Export: Cmd/Ctrl+Shift+E
  useHotkeys(
    () => hotkeys.current.EXPORT,
    (event) => {
      event.preventDefault()
      callbacks().onExport?.()
    },
    HOTKEY_OPTIONS,
  )

  // Open Scene Browser: Cmd/Ctrl+Shift+F
  useHotkeys(
    () => hotkeys.current.OPEN_SCENE_BROWSER,
    (event) => {
      event.preventDefault()
      useSceneBrowserStore.getState().openBrowser({ focus: true })
    },
    HOTKEY_OPTIONS,
  )

  // Workspace switching: Alt+1 (Edit), Alt+2 (Color), Alt+3 (Motion).
  // WORKSPACE_ANIMATE retains its persisted command id for shortcut migration.
  useHotkeys(
    () => hotkeys.current.WORKSPACE_EDIT,
    (event) => {
      event.preventDefault()
      useEditorStore.getState().setWorkspace('edit')
    },
    HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.WORKSPACE_COLOR,
    (event) => {
      event.preventDefault()
      useEditorStore.getState().setWorkspace('color')
    },
    HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.WORKSPACE_ANIMATE,
    (event) => {
      event.preventDefault()
      useEditorStore.getState().setWorkspace('motion')
    },
    HOTKEY_OPTIONS,
  )
}
