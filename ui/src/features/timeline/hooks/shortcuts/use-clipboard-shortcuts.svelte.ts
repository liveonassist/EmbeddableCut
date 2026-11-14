// SPDX-License-Identifier: MIT

/**
 * Clipboard shortcuts: Ctrl+C (copy), Ctrl+X (cut), Ctrl+V (paste).
 */

import { toast } from 'svelte-sonner'
import { select } from '$lib/store.svelte'
import { usePlaybackStore } from '@/shared/state/playback'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import {
  addItems,
  removeItems,
  updateTransition,
} from '@/features/timeline/stores/timeline-actions'
import { useZoomStore } from '@/features/timeline/stores/zoom-store'
import { useSelectionStore } from '@/shared/state/selection'
import { useClipboardStore } from '@/shared/state/clipboard'
import { useCompositionNavigationStore } from '@/features/timeline/stores/composition-navigation-store'
import { useCompositionsStore } from '@/features/timeline/stores/compositions-store'
import { useKeyframeSelectionStore } from '@/features/timeline/stores/keyframe-selection-store'
import { HOTKEY_OPTIONS } from '@/config/hotkeys'
import type { Transition } from '@/types/transition'
import type { TimelineItem } from '@/types/timeline'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
import {
  isCompositionWrapperItem,
  wouldCreateCompositionCycle,
} from '@/features/timeline/utils/composition-graph'
import { handleTranscriptClipboardCopy } from '@/features/timeline/utils/transcript-copy-bridge'
import { queryEditorElement } from '@/features/timeline/utils/global-cursor-roots'
import { useHotkeys } from '$lib/hotkeys.svelte'

function revealPastedItems(itemIds: readonly string[]): void {
  if (itemIds.length === 0) {
    return
  }

  window.requestAnimationFrame(() => {
    const container = queryEditorElement<HTMLElement>('.timeline-container')
    if (!container) {
      return
    }

    const { items } = useItemsStore.getState()
    const { fps } = useTimelineSettingsStore.getState()
    const { pixelsPerSecond } = useZoomStore.getState()
    const pastedItems = items.filter((item) => itemIds.includes(item.id))
    if (pastedItems.length === 0 || fps <= 0) {
      return
    }

    const startPx = Math.min(...pastedItems.map((item) => (item.from / fps) * pixelsPerSecond))
    const endPx = Math.max(
      ...pastedItems.map((item) => ((item.from + item.durationInFrames) / fps) * pixelsPerSecond),
    )
    const padding = 48
    const viewLeft = container.scrollLeft
    const viewRight = container.scrollLeft + container.clientWidth

    if (startPx >= viewLeft + padding && endPx <= viewRight - padding) {
      return
    }

    let nextScrollLeft = container.scrollLeft
    if (startPx < viewLeft + padding) {
      nextScrollLeft = Math.max(0, startPx - padding)
    } else if (endPx > viewRight - padding) {
      nextScrollLeft = Math.max(0, endPx - container.clientWidth + padding)
    }

    container.scrollLeft = nextScrollLeft
  })
}

export function useClipboardShortcuts(): void {
  const hotkeys = useResolvedHotkeys()
  const noKeyframesSelected = select(
    useKeyframeSelectionStore,
    (s) => s.selectedKeyframes.length === 0,
  )
  const clipboardHotkeyOptions = () => ({
    ...HOTKEY_OPTIONS,
    eventListenerOptions: { capture: true },
    enabled: noKeyframesSelected.current,
  })

  // Clipboard: Ctrl+C - Copy selected transition properties or timeline items
  useHotkeys(
    () => hotkeys.current.COPY,
    (event) => {
      // Transcript editor copies the selected words instead of the clip.
      if (handleTranscriptClipboardCopy(false)) {
        event.preventDefault()
        return
      }
      const { selectedTransitionId, selectedItemIds } = useSelectionStore.getState()
      const { copyTransition, copyItems } = useClipboardStore.getState()
      if (selectedTransitionId) {
        event.preventDefault()
        const transition = useTransitionsStore
          .getState()
          .transitions.find((t: Transition) => t.id === selectedTransitionId)
        if (transition) {
          copyTransition({
            presentation: transition.presentation,
            direction: transition.direction,
            timing: transition.timing,
            durationInFrames: transition.durationInFrames,
          })
          toast.success('Copied transition settings')
        }
        return
      }
      if (selectedItemIds.length > 0) {
        event.preventDefault()
        const currentFrame = usePlaybackStore.getState().currentFrame
        const selectedItems = useItemsStore
          .getState()
          .items.filter((item) => selectedItemIds.includes(item.id))
        if (selectedItems.length > 0) {
          copyItems(selectedItems, currentFrame, 'copy')
          toast.success(
            selectedItems.length === 1 ? 'Copied 1 item' : `Copied ${selectedItems.length} items`,
          )
        }
      }
    },
    clipboardHotkeyOptions,
  )

  // Clipboard: Ctrl+X - Cut selected items immediately
  useHotkeys(
    () => hotkeys.current.CUT,
    (event) => {
      // Transcript editor cuts the selected words instead of the clip.
      if (handleTranscriptClipboardCopy(true)) {
        event.preventDefault()
        return
      }
      const { selectedItemIds, clearItemSelection } = useSelectionStore.getState()
      if (selectedItemIds.length > 0) {
        event.preventDefault()
        const currentFrame = usePlaybackStore.getState().currentFrame
        const selectedItems = useItemsStore
          .getState()
          .items.filter((item) => selectedItemIds.includes(item.id))
        if (selectedItems.length > 0) {
          useClipboardStore.getState().copyItems(selectedItems, currentFrame, 'cut')
          removeItems(selectedItemIds)
          clearItemSelection()
          toast.success(
            selectedItems.length === 1 ? 'Cut 1 item' : `Cut ${selectedItems.length} items`,
          )
        }
      }
    },
    clipboardHotkeyOptions,
  )

  // Clipboard: Ctrl+V - Paste transition properties or timeline items
  useHotkeys(
    () => hotkeys.current.PASTE,
    (event) => {
      const { selectedTransitionId, activeTrackId, selectItems } = useSelectionStore.getState()
      const { transitionClipboard, itemsClipboard } = useClipboardStore.getState()
      if (selectedTransitionId && transitionClipboard) {
        event.preventDefault()
        updateTransition(selectedTransitionId, {
          presentation: transitionClipboard.presentation,
          direction: transitionClipboard.direction,
          timing: transitionClipboard.timing,
          durationInFrames: transitionClipboard.durationInFrames,
        })
        toast.success('Pasted transition settings')
        return
      }
      if (itemsClipboard && itemsClipboard.items.length > 0) {
        event.preventDefault()
        const currentFrame = usePlaybackStore.getState().currentFrame
        const { items: storeItems, tracks } = useItemsStore.getState()
        const newItemIds: string[] = []
        const newItems: TimelineItem[] = []
        const usedTrackIds = new Set<string>()
        const linkedGroupMap = new Map<string, string>()

        const activeCompositionId = useCompositionNavigationStore.getState().activeCompositionId
        const compositionById = useCompositionsStore.getState().compositionById
        const pasteItems =
          activeCompositionId === null
            ? itemsClipboard.items
            : itemsClipboard.items.filter(
                (item) =>
                  !isCompositionWrapperItem(item as TimelineItem) ||
                  !wouldCreateCompositionCycle({
                    parentCompositionId: activeCompositionId,
                    insertedCompositionId: (item as { compositionId: string }).compositionId,
                    compositionById,
                  }),
              )
        if (pasteItems.length === 0) return

        // When the clipboard spans more than one source track (e.g. a linked
        // video+audio pair copied from the transcript), preserve each item's own
        // track so the pair lands on video/audio tracks separately. A
        // single-track copy still pastes onto the active track as before.
        const preserveSourceTracks = new Set(pasteItems.map((item) => item.trackId)).size > 1

        const findNextAvailableSpace = (
          trackId: string,
          startFrame: number,
          duration: number,
        ): number => {
          const trackItems = storeItems
            .filter((item) => item.trackId === trackId)
            .sort((a, b) => a.from - b.from)

          let candidateFrame = startFrame

          for (const item of trackItems) {
            const itemEnd = item.from + item.durationInFrames
            if (candidateFrame < itemEnd && candidateFrame + duration > item.from) {
              candidateFrame = itemEnd
            }
          }

          return candidateFrame
        }

        const hasSpaceAt = (trackId: string, startFrame: number, duration: number): boolean => {
          const trackItems = storeItems.filter((item) => item.trackId === trackId)
          for (const item of trackItems) {
            const itemEnd = item.from + item.durationInFrames
            if (startFrame < itemEnd && startFrame + duration > item.from) {
              return false
            }
          }
          return true
        }

        for (const itemData of pasteItems) {
          const newId = crypto.randomUUID()
          newItemIds.push(newId)

          let targetTrackId = preserveSourceTracks ? itemData.trackId : activeTrackId
          if (!targetTrackId || !tracks.some((t) => t.id === targetTrackId)) {
            targetTrackId = itemData.trackId
          }
          const trackExists = tracks.some((t) => t.id === targetTrackId)
          if (!trackExists && tracks.length > 0) {
            targetTrackId = tracks[0]!.id
          }

          const desiredFrom = currentFrame
          const duration = itemData.durationInFrames

          let newFrom: number
          if (hasSpaceAt(targetTrackId, desiredFrom, duration)) {
            newFrom = desiredFrom
          } else {
            newFrom = findNextAvailableSpace(targetTrackId, desiredFrom, duration)
          }

          const newItem = {
            ...itemData,
            id: newId,
            from: newFrom,
            trackId: targetTrackId,
            originId: newId,
            linkedGroupId: itemData.linkedGroupId
              ? (linkedGroupMap.get(itemData.linkedGroupId) ??
                linkedGroupMap
                  .set(itemData.linkedGroupId, crypto.randomUUID())
                  .get(itemData.linkedGroupId))
              : undefined,
          }

          newItems.push(newItem as TimelineItem)
          usedTrackIds.add(targetTrackId)
        }

        // Add every pasted item in a single ADD_ITEMS command so one Ctrl+Z
        // undoes the whole paste (including a linked A/V pair), not item-by-item.
        if (newItems.length > 0) {
          addItems(newItems)
        }

        if (newItemIds.length > 0) {
          selectItems(newItemIds)
          revealPastedItems(newItemIds)
          const activeTrack = activeTrackId
            ? tracks.find((track) => track.id === activeTrackId)
            : null
          const usedTracks = tracks.filter((track) => usedTrackIds.has(track.id))
          const pasteTitle =
            newItemIds.length === 1 ? 'Pasted 1 item' : `Pasted ${newItemIds.length} items`

          if (activeTrack) {
            toast.success(pasteTitle, {
              description: `Active Track: ${activeTrack.name.replace(/^Track\s+/i, '')}`,
            })
          } else if (usedTracks.length === 1) {
            toast.success(pasteTitle, {
              description: `Track: ${usedTracks[0]!.name.replace(/^Track\s+/i, '')}`,
            })
          } else {
            toast.success(pasteTitle)
          }

          if (itemsClipboard.copyType === 'cut') {
            useClipboardStore.getState().clearItemsClipboard()
          }
        }
      }
    },
    clipboardHotkeyOptions,
  )
}
