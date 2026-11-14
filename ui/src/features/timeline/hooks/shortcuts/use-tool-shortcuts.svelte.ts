// SPDX-License-Identifier: MIT

/**
 * Tool shortcuts: V (Select), T (Trim Edit), C (Razor), Shift+C (Split at cursor), R (Rate Stretch).
 */

import { usePlaybackStore } from '@/shared/state/playback'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { splitItem } from '@/features/timeline/stores/timeline-actions'
import { useSelectionStore } from '@/shared/state/selection'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import type { TimelineShortcutCallbacks } from '../use-timeline-shortcuts.svelte'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
import { SLIP_SLIDE_TOOLS_ENABLED } from '@/features/timeline/constants'
import { useTimelineHotkey } from './timeline-hotkey'

type ActiveTool = ReturnType<typeof useSelectionStore.getState>['activeTool']

function toggleTool(tool: ActiveTool): void {
  const { activeTool, setActiveTool } = useSelectionStore.getState()
  setActiveTool(activeTool === tool ? 'select' : tool)
}

export function useToolShortcuts(callbacks: () => TimelineShortcutCallbacks): void {
  const hotkeys = useResolvedHotkeys()

  // Tool: V - Selection Tool
  useTimelineHotkey(
    () => hotkeys.current.SELECTION_TOOL,
    (event) => {
      event.preventDefault()
      useSelectionStore.getState().setActiveTool('select')
    },
  )

  // Tool: T - Toggle Trim Edit Tool
  useTimelineHotkey(
    () => hotkeys.current.TRIM_EDIT_TOOL,
    (event) => {
      event.preventDefault()
      toggleTool('trim-edit')
    },
  )

  // Tool: C - Toggle Razor/Cut Mode
  useTimelineHotkey(
    () => hotkeys.current.RAZOR_TOOL,
    (event) => {
      event.preventDefault()
      toggleTool('razor')
    },
  )

  // Tool: Shift+C - Split hovered item at gray playhead (or main playhead)
  useTimelineHotkey(
    () => hotkeys.current.SPLIT_AT_CURSOR,
    (event) => {
      event.preventDefault()
      const { previewFrame, previewItemId, currentFrame } = usePlaybackStore.getState()
      const splitFrame = previewFrame ?? currentFrame
      const { items } = useItemsStore.getState()

      // If hovering over a specific item, split only that item
      if (previewItemId) {
        const item = items.find((i) => i.id === previewItemId)
        if (item && splitFrame > item.from && splitFrame < item.from + item.durationInFrames) {
          splitItem(item.id, splitFrame)
          const { onSplit } = callbacks()
          if (onSplit) {
            onSplit()
          }
        }
      }
    },
  )

  // Tool: R - Toggle Rate Stretch Tool
  useTimelineHotkey(
    () => hotkeys.current.RATE_STRETCH_TOOL,
    (event) => {
      event.preventDefault()
      toggleTool('rate-stretch')
    },
  )

  // Tool: Y - Toggle Slip Tool
  useTimelineHotkey(
    () => hotkeys.current.SLIP_TOOL,
    (event) => {
      event.preventDefault()
      toggleTool('slip')
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: SLIP_SLIDE_TOOLS_ENABLED }),
  )

  // Tool: U - Toggle Slide Tool
  useTimelineHotkey(
    () => hotkeys.current.SLIDE_TOOL,
    (event) => {
      event.preventDefault()
      toggleTool('slide')
    },
    () => ({ ...HOTKEY_OPTIONS, enabled: SLIP_SLIDE_TOOLS_ENABLED }),
  )
}
