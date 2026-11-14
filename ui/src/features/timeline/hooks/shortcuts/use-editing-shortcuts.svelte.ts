// SPDX-License-Identifier: MIT

/**
 * Editing shortcuts: Delete, Ripple Delete, Join, Split, Keyframes.
 */

import { usePlaybackStore } from '@/shared/state/playback'
import { useEditorStore } from '@/shared/state/editor'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useKeyframesStore } from '@/features/timeline/stores/keyframes-store'
import {
  joinItems,
  removeItems,
  removeMarker,
  removeTransition,
  rippleDeleteItems,
  updateItemsTransformMap,
} from '@/features/timeline/stores/timeline-actions'
import { useSelectionStore } from '@/shared/state/selection'
import { canJoinMultipleItems } from '@/features/timeline/utils/clip-utils'
import { canLinkSelection, hasLinkedItems } from '@/features/timeline/utils/linked-items'
import {
  insertFreezeFrame,
  linkItems,
  splitAllItemsAtFrame,
  unlinkItems,
} from '@/features/timeline/stores/actions/item-actions'
import type { TransformProperties } from '@/types/transform'
import type { TimelineShortcutCallbacks } from '../use-timeline-shortcuts.svelte'
import { useClearKeyframesDialogStore } from '@/shared/state/clear-keyframes-dialog'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
import { useKeyframeSelectionStore } from '@/features/timeline/stores/keyframe-selection-store'
import { useHotkeys } from '$lib/hotkeys.svelte'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'

// Another panel (keyframe or transcript editor) owns Delete/Backspace — clip
// delete must yield so it doesn't also fire and remove the timeline clip.
function isDeleteOwnedByPanel(): boolean {
  const { keyframeEditorShortcutScopeActive, transcriptEditorShortcutScopeActive } =
    useEditorStore.getState()
  const { editKeyframePanelOpen } = useSelectionStore.getState()
  return (
    keyframeEditorShortcutScopeActive ||
    (editKeyframePanelOpen && useKeyframeSelectionStore.getState().selectedKeyframes.length > 0) ||
    transcriptEditorShortcutScopeActive
  )
}

function nudgeSelectedVisualItems(deltaX: number, deltaY: number): void {
  const { selectedItemIds } = useSelectionStore.getState()
  if (selectedItemIds.length === 0) return
  if (deltaX === 0 && deltaY === 0) return

  const { items } = useItemsStore.getState()
  const transforms = new Map<string, Partial<TransformProperties>>()
  for (const itemId of selectedItemIds) {
    const item = items.find((entry) => entry.id === itemId)
    if (!item || item.type === 'audio') continue
    const defaultTransform: Partial<TransformProperties> = item.transform ?? { x: 0, y: 0 }
    const nextX = Math.round((defaultTransform.x ?? 0) + deltaX)
    const nextY = Math.round((defaultTransform.y ?? 0) + deltaY)

    transforms.set(itemId, {
      ...defaultTransform,
      x: nextX,
      y: nextY,
    })
  }

  if (transforms.size === 0) return
  updateItemsTransformMap(transforms, { operation: 'move' })
}

function splitAtPlayhead(event: KeyboardEvent): void {
  event.preventDefault()
  const { previewFrame, currentFrame } = usePlaybackStore.getState()
  const splitFrame = previewFrame ?? currentFrame
  splitAllItemsAtFrame(splitFrame)
}

export function useEditingShortcuts(callbacks: () => TimelineShortcutCallbacks): void {
  const hotkeys = useResolvedHotkeys()

  // Delete selected items, marker, or transition
  const deleteSelection = (event: KeyboardEvent) => {
    if (isDeleteOwnedByPanel()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const { selectedTransitionId, selectedMarkerId, selectedItemIds, clearSelection } =
      useSelectionStore.getState()
    if (selectedTransitionId) {
      event.preventDefault()
      removeTransition(selectedTransitionId)
      clearSelection()
      return
    }
    if (selectedMarkerId) {
      event.preventDefault()
      removeMarker(selectedMarkerId)
      clearSelection()
      return
    }
    if (selectedItemIds.length > 0) {
      event.preventDefault()
      removeItems(selectedItemIds)
      const { onDelete } = callbacks()
      if (onDelete) {
        onDelete()
      }
    }
  }

  // Ripple delete selected items (delete + close gap)
  const rippleDeleteSelection = (event: KeyboardEvent) => {
    if (isDeleteOwnedByPanel()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const { selectedItemIds, clearSelection } = useSelectionStore.getState()
    if (selectedItemIds.length > 0) {
      event.preventDefault()
      rippleDeleteItems(selectedItemIds)
      clearSelection()
      const { onDelete } = callbacks()
      if (onDelete) {
        onDelete()
      }
    }
  }

  // Editing: Delete - Delete selected items, marker, or transition
  useHotkeys(
    () => hotkeys.current.DELETE_SELECTED,
    deleteSelection,
    () => HOTKEY_OPTIONS,
  )

  // Editing: Backspace - Delete selected items, marker, or transition (alternative)
  useHotkeys(
    () => hotkeys.current.DELETE_SELECTED_ALT,
    deleteSelection,
    () => HOTKEY_OPTIONS,
  )

  // Editing: Ctrl+Delete - Ripple delete selected items (delete + close gap)
  useHotkeys(
    () => hotkeys.current.RIPPLE_DELETE,
    rippleDeleteSelection,
    () => HOTKEY_OPTIONS,
  )

  // Editing: Ctrl+Backspace - Ripple delete selected items (alternative)
  useHotkeys(
    () => hotkeys.current.RIPPLE_DELETE_ALT,
    rippleDeleteSelection,
    () => HOTKEY_OPTIONS,
  )

  // Editing: Shift+Arrow keys - nudge selected visual items by 1px
  useHotkeys(
    () => hotkeys.current.NUDGE_LEFT,
    (event) => {
      event.preventDefault()
      nudgeSelectedVisualItems(-1, 0)
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.NUDGE_RIGHT,
    (event) => {
      event.preventDefault()
      nudgeSelectedVisualItems(1, 0)
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.NUDGE_UP,
    (event) => {
      event.preventDefault()
      nudgeSelectedVisualItems(0, -1)
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.NUDGE_DOWN,
    (event) => {
      event.preventDefault()
      nudgeSelectedVisualItems(0, 1)
    },
    () => HOTKEY_OPTIONS,
  )

  // Editing: Cmd/Ctrl+Shift+Arrow keys - nudge selected visual items by 10px
  useHotkeys(
    () => hotkeys.current.NUDGE_LEFT_LARGE,
    (event) => {
      event.preventDefault()
      nudgeSelectedVisualItems(-10, 0)
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.NUDGE_RIGHT_LARGE,
    (event) => {
      event.preventDefault()
      nudgeSelectedVisualItems(10, 0)
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.NUDGE_UP_LARGE,
    (event) => {
      event.preventDefault()
      nudgeSelectedVisualItems(0, -10)
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.NUDGE_DOWN_LARGE,
    (event) => {
      event.preventDefault()
      nudgeSelectedVisualItems(0, 10)
    },
    () => HOTKEY_OPTIONS,
  )

  // Editing: Shift+J - Join selected clips
  useHotkeys(
    () => hotkeys.current.JOIN_ITEMS,
    (event) => {
      const { selectedItemIds } = useSelectionStore.getState()
      if (selectedItemIds.length < 2) return

      const { items } = useItemsStore.getState()
      const selectedItems = selectedItemIds
        .map((id) => items.find((i) => i.id === id))
        .filter((item): item is NonNullable<typeof item> => item !== undefined)

      if (selectedItems.length < 2) return

      if (canJoinMultipleItems(selectedItems)) {
        event.preventDefault()
        joinItems(selectedItemIds)
      }
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.LINK_AUDIO_VIDEO,
    (event) => {
      const { selectedItemIds } = useSelectionStore.getState()
      if (selectedItemIds.length < 2) return
      if (!canLinkSelection(useItemsStore.getState().items, selectedItemIds)) return

      event.preventDefault()
      linkItems(selectedItemIds)
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.UNLINK_AUDIO_VIDEO,
    (event) => {
      const { selectedItemIds } = useSelectionStore.getState()
      if (selectedItemIds.length === 0) return
      const { items } = useItemsStore.getState()
      if (!selectedItemIds.some((id) => hasLinkedItems(items, id))) return

      event.preventDefault()
      unlinkItems(selectedItemIds)
    },
    () => HOTKEY_OPTIONS,
  )

  useHotkeys(
    () => hotkeys.current.TOGGLE_LINKED_SELECTION,
    (event) => {
      event.preventDefault()
      useEditorStore.getState().toggleLinkedSelectionEnabled()
    },
    () => HOTKEY_OPTIONS,
  )

  // Editing: Alt+C - Split all items at gray playhead (or main playhead)
  useHotkeys(
    () => hotkeys.current.SPLIT_AT_PLAYHEAD_ALT,
    splitAtPlayhead,
    () => ({ ...HOTKEY_OPTIONS, eventListenerOptions: { capture: true } }),
  )

  // Editing: Shift+F - Insert freeze frame at playhead
  useHotkeys(
    () => hotkeys.current.FREEZE_FRAME,
    (event) => {
      const { selectedItemIds } = useSelectionStore.getState()
      if (selectedItemIds.length !== 1) return
      const currentFrame = usePlaybackStore.getState().currentFrame
      const selectedItem = useItemsStore.getState().items.find((i) => i.id === selectedItemIds[0])
      if (!selectedItem || selectedItem.type !== 'video') return

      // Check playhead is within item bounds
      if (
        currentFrame <= selectedItem.from ||
        currentFrame >= selectedItem.from + selectedItem.durationInFrames
      )
        return

      event.preventDefault()
      void insertFreezeFrame(selectedItem.id, currentFrame)
    },
    () => HOTKEY_OPTIONS,
  )

  // Keyframes: Shift+A - Clear all keyframes for selected items (with confirmation)
  useHotkeys(
    () => hotkeys.current.CLEAR_KEYFRAMES,
    (event) => {
      const { selectedItemIds } = useSelectionStore.getState()
      if (selectedItemIds.length === 0) return

      event.preventDefault()

      const storeKeyframes = useKeyframesStore.getState().keyframes
      const itemsWithKeyframes = selectedItemIds.filter((itemId) => {
        const itemKeyframes = storeKeyframes.find((k) => k.itemId === itemId)
        return itemKeyframes?.properties.some((p) => p.keyframes.length > 0)
      })

      if (itemsWithKeyframes.length === 0) return

      useClearKeyframesDialogStore.getState().openClearAll(itemsWithKeyframes)
    },
    () => HOTKEY_OPTIONS,
  )
}
