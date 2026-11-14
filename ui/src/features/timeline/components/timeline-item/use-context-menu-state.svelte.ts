// SPDX-License-Identifier: MIT

import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { useEditorStore } from '@/shared/state/editor'
import { useSelectionStore } from '@/shared/state/selection'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import {
  expandSelectionWithLinkedItems,
  getLinkedItemIds,
} from '@/features/timeline/utils/linked-items'

export interface ContextMenuState {
  readonly closerEdge: 'left' | 'right' | null
  handleContextMenu: (e: MouseEvent) => void
}

export function useContextMenuState(item: () => TimelineItemType): ContextMenuState {
  let closerEdge = $state<'left' | 'right' | null>(null)

  function handleContextMenu(e: MouseEvent) {
    const itemId = item().id
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const midpoint = rect.width / 2
    closerEdge = x < midpoint ? 'left' : 'right'

    const { selectedItemIds, selectItems } = useSelectionStore.getState()
    const items = useItemsStore.getState().items
    const linkedSelectionEnabled = useEditorStore.getState().linkedSelectionEnabled
    const targetIds = linkedSelectionEnabled ? getLinkedItemIds(items, itemId) : [itemId]
    const isCurrentSelection = targetIds.every((id) => selectedItemIds.includes(id))

    if (!isCurrentSelection) {
      if (
        selectedItemIds.length === 1 &&
        targetIds.length === 1 &&
        !selectedItemIds.includes(itemId)
      ) {
        selectItems(
          linkedSelectionEnabled
            ? expandSelectionWithLinkedItems(items, [...selectedItemIds, itemId])
            : Array.from(new Set([...selectedItemIds, itemId])),
        )
      } else {
        selectItems(targetIds)
      }
    }
  }

  return {
    get closerEdge() {
      return closerEdge
    },
    handleContextMenu,
  }
}
