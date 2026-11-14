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
import { useTimelineHotkey } from './timeline-hotkey'

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
  useTimelineHotkey(
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
  useTimelineHotkey(
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
  useTimelineHotkey(
    () => hotkeys.current.TOGGLE_SNAP,
    (event) => {
      event.preventDefault()
      toggleSnap()
    },
  )

  // UI: Shift+S - Toggle Canvas (gizmo) Snap — independent from timeline snap.
  useTimelineHotkey(
    () => hotkeys.current.TOGGLE_CANVAS_SNAP,
    (event) => {
      event.preventDefault()
      const s = useSettingsStore.getState()
      s.setSetting('canvasSnapEnabled', !s.canvasSnapEnabled)
    },
  )

  // The zoom shortcuts listen in the capture phase in FreeCut; see timeline-hotkey.

  // Zoom: Cmd/Ctrl+Equals - Zoom in
  useTimelineHotkey(
    () => hotkeys.current.ZOOM_IN,
    (event) => {
      event.preventDefault()
      useZoomStore.getState().zoomIn()
    },
  )

  // Zoom: Cmd/Ctrl+Minus - Zoom out
  useTimelineHotkey(
    () => hotkeys.current.ZOOM_OUT,
    (event) => {
      event.preventDefault()
      useZoomStore.getState().zoomOut()
    },
  )

  // Zoom: Backslash - Zoom to Fit
  useTimelineHotkey(
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
  )

  // Zoom: Shift+Backslash - Zoom to 100% centered on cursor (or playhead if cursor not on timeline)
  useTimelineHotkey(() => hotkeys.current.ZOOM_TO_100, zoomTo100AtCursor)

  // Zoom: Cmd/Ctrl+0 - Reset timeline zoom to 100%
  useTimelineHotkey(() => hotkeys.current.ZOOM_TO_100_ALT, zoomTo100AtCursor)
}
