// SPDX-License-Identifier: MIT

/**
 * UI shortcuts: S (snap toggle), Cmd/Ctrl+=/- (zoom), \\ (zoom to fit), Shift+\\ or Cmd/Ctrl+0 (zoom to 100%), Undo/Redo.
 */

import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { useTimelineCommandStore } from '@/features/timeline/stores/timeline-command-store'
import { toggleSnap } from '@/features/timeline/stores/timeline-actions'
import { useZoomStore, getZoomTo100Handler } from '@/features/timeline/stores/zoom-store'
import { usePlaybackStore } from '@/shared/state/playback'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import type { TimelineShortcutCallbacks } from '../use-timeline-shortcuts.svelte'
import { useSettingsStore } from '@/features/timeline/deps/settings'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
import { queryEditorElement } from '@/features/timeline/utils/global-cursor-roots'
import { useHotkeys } from '$lib/hotkeys.svelte'

function zoomTo100AtCursor(event: KeyboardEvent): void {
  event.preventDefault()
  const { currentFrame, previewFrame } = usePlaybackStore.getState()
  const targetFrame = previewFrame ?? currentFrame

  const handler = getZoomTo100Handler()
  if (handler) {
    handler(targetFrame)
  }
}

export function useUIShortcuts(callbacks: () => TimelineShortcutCallbacks): void {
  const hotkeys = useResolvedHotkeys()

  // History: Cmd/Ctrl+Z - Undo
  useHotkeys(
    () => hotkeys.current.UNDO,
    (event) => {
      event.preventDefault()
      useTimelineCommandStore.getState().undo()
      const { onUndo } = callbacks()
      if (onUndo) {
        onUndo()
      }
    },
    () => ({
      ...HOTKEY_OPTIONS,
      enableOnFormTags: true,
    }),
  )

  // History: Cmd/Ctrl+Shift+Z - Redo
  useHotkeys(
    () => hotkeys.current.REDO,
    (event) => {
      event.preventDefault()
      useTimelineCommandStore.getState().redo()
      const { onRedo } = callbacks()
      if (onRedo) {
        onRedo()
      }
    },
    () => ({
      ...HOTKEY_OPTIONS,
      enableOnFormTags: true,
    }),
  )

  // UI: S - Toggle Snap
  useHotkeys(
    () => hotkeys.current.TOGGLE_SNAP,
    (event) => {
      event.preventDefault()
      toggleSnap()
    },
    () => HOTKEY_OPTIONS,
  )

  // UI: Shift+S - Toggle Canvas (gizmo) Snap — independent from timeline snap.
  useHotkeys(
    () => hotkeys.current.TOGGLE_CANVAS_SNAP,
    (event) => {
      event.preventDefault()
      const s = useSettingsStore.getState()
      s.setSetting('canvasSnapEnabled', !s.canvasSnapEnabled)
    },
    () => HOTKEY_OPTIONS,
  )

  const zoomHotkeyOptions = () => ({ ...HOTKEY_OPTIONS, eventListenerOptions: { capture: true } })

  // Zoom: Cmd/Ctrl+Equals - Zoom in
  useHotkeys(
    () => hotkeys.current.ZOOM_IN,
    (event) => {
      event.preventDefault()
      useZoomStore.getState().zoomIn()
    },
    zoomHotkeyOptions,
  )

  // Zoom: Cmd/Ctrl+Minus - Zoom out
  useHotkeys(
    () => hotkeys.current.ZOOM_OUT,
    (event) => {
      event.preventDefault()
      useZoomStore.getState().zoomOut()
    },
    zoomHotkeyOptions,
  )

  // Zoom: Backslash - Zoom to Fit
  useHotkeys(
    () => hotkeys.current.ZOOM_TO_FIT,
    (event) => {
      event.preventDefault()
      const { onZoomToFit } = callbacks()
      if (onZoomToFit) {
        onZoomToFit()
        return
      }
      const container = queryEditorElement('.timeline-container')
      if (!container) return

      const fps = useTimelineSettingsStore.getState().fps
      const items = useItemsStore.getState().items
      const containerWidth = container.clientWidth

      const contentDuration = Math.max(
        10,
        items.reduce((max, item) => {
          const itemEnd = (item.from + item.durationInFrames) / fps
          return Math.max(max, itemEnd)
        }, 0),
      )

      useZoomStore.getState().zoomToFit(containerWidth, contentDuration)

      container.scrollLeft = 0
    },
    () => HOTKEY_OPTIONS,
  )

  // Zoom: Shift+Backslash - Zoom to 100% centered on cursor (or playhead if cursor not on timeline)
  useHotkeys(
    () => hotkeys.current.ZOOM_TO_100,
    zoomTo100AtCursor,
    () => HOTKEY_OPTIONS,
  )

  // Zoom: Cmd/Ctrl+0 - Reset timeline zoom to 100%
  useHotkeys(() => hotkeys.current.ZOOM_TO_100_ALT, zoomTo100AtCursor, zoomHotkeyOptions)
}
