// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { select, shallow } from '$lib/store.svelte'
import type { TimelineItem } from '@/types/timeline'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { getTrackItemRelations } from '@/features/timeline/stores/items-store-indexes'
import { useSelectionStore } from '@/shared/state/selection'
import {
  dragOffsetRef,
  dragPreviewOffsetByItemRef,
  isLargeAltDragCanvasItem,
} from '../../hooks/use-timeline-drag.svelte'
import {
  getTimelineItemDragParticipation,
  shouldDimTimelineItemForDrag,
  type TimelineItemGestureMode,
} from './drag-visual-mode'

type JoinDragState = { left: boolean; right: boolean }

type DragVisualItem = Pick<TimelineItem, 'id' | 'from' | 'durationInFrames' | 'trackId'>

interface UseDragVisualStateParams {
  item: DragVisualItem
  gestureMode: TimelineItemGestureMode
  isDragging: boolean
  transform: HTMLDivElement | null
  ghost: HTMLDivElement | null
}

interface UseDragVisualStateResult {
  readonly dragAffectsJoin: JoinDragState
  isAnyDragActiveRef: { current: boolean }
  dragWasActiveRef: { current: boolean }
  readonly isPartOfMultiDrag: boolean
  readonly isAltDrag: boolean
  readonly isPartOfDrag: boolean
  readonly isBeingDragged: boolean
  readonly shouldDimForDrag: boolean
}

interface ActiveDragVisual {
  update: () => void
}

function setStyleIfChanged<K extends keyof CSSStyleDeclaration>(
  style: CSSStyleDeclaration,
  property: K,
  value: CSSStyleDeclaration[K],
) {
  if (style[property] !== value) {
    style[property] = value
  }
}

const activeDragVisuals = new Set<ActiveDragVisual>()
let sharedDragVisualRaf: number | null = null

function runSharedDragVisualFrame() {
  sharedDragVisualRaf = null
  for (const visual of activeDragVisuals) {
    visual.update()
  }
  if (activeDragVisuals.size > 0) {
    sharedDragVisualRaf = requestAnimationFrame(runSharedDragVisualFrame)
  }
}

function registerDragVisual(visual: ActiveDragVisual) {
  activeDragVisuals.add(visual)
  if (sharedDragVisualRaf === null) {
    sharedDragVisualRaf = requestAnimationFrame(runSharedDragVisualFrame)
  }
}

function unregisterDragVisual(visual: ActiveDragVisual) {
  activeDragVisuals.delete(visual)
  if (activeDragVisuals.size === 0 && sharedDragVisualRaf !== null) {
    cancelAnimationFrame(sharedDragVisualRaf)
    sharedDragVisualRaf = null
  }
}

export function useDragVisualState(
  params: () => UseDragVisualStateParams,
): UseDragVisualStateResult {
  const item = $derived(params().item)
  const itemId = $derived(item.id)
  const gestureMode = $derived(params().gestureMode)
  const isDragging = $derived(params().isDragging)
  const transform = $derived(params().transform)
  const ghost = $derived(params().ghost)

  let wasDragging = false
  const isAnyDragActiveRef = { current: false }
  const dragWasActiveRef = { current: false }
  let dragWasActiveTimeout: ReturnType<typeof setTimeout> | null = null

  const neighboringJoinIdsSelection = $derived.by(() => {
    const current = item
    return select(
      useItemsStore,
      (state) =>
        getTrackItemRelations(state.itemsByTrackId[current.trackId], current).dragNeighborIds,
      shallow,
    )
  })
  const neighboringJoinIds = $derived(neighboringJoinIdsSelection.current)

  const dragParticipationSelection = $derived.by(() => {
    const id = itemId
    const mode = gestureMode
    return select(useSelectionStore, (state) =>
      getTimelineItemDragParticipation({
        itemId: id,
        dragState: state.dragState,
        gestureMode: mode,
      }),
    )
  })
  const dragParticipation = $derived(dragParticipationSelection.current)

  const dragAffectsJoin = $derived.by(() => {
    const id = itemId
    const joinIds = neighboringJoinIds
    return select(
      useSelectionStore,
      (state) => {
        if (!state.dragState?.isDragging) {
          return { left: false, right: false }
        }

        const draggedItemIds =
          state.dragState.draggedItemIdSet ?? new Set(state.dragState.draggedItemIds)
        const itemDragged = draggedItemIds.has(id)

        return {
          left: itemDragged || !!(joinIds.leftId && draggedItemIds.has(joinIds.leftId)),
          right: itemDragged || !!(joinIds.rightId && draggedItemIds.has(joinIds.rightId)),
        }
      },
      shallow,
    )
  })
  // Read by the shared rAF loop without re-registering on every participation change.
  let dragParticipationRef = untrack(() => dragParticipation)
  $effect.pre(() => {
    dragParticipationRef = dragParticipation
  })

  $effect(() =>
    untrack(() => {
      const updateDragActiveRefs = (isDragActive: boolean) => {
        const previousWasActive = isAnyDragActiveRef.current
        isAnyDragActiveRef.current = isDragActive

        if (previousWasActive && !isDragActive) {
          dragWasActiveRef.current = true
          if (dragWasActiveTimeout) {
            clearTimeout(dragWasActiveTimeout)
          }
          dragWasActiveTimeout = setTimeout(() => {
            dragWasActiveRef.current = false
            dragWasActiveTimeout = null
          }, 100)
        }
      }

      updateDragActiveRefs(!!useSelectionStore.getState().dragState?.isDragging)
      return useSelectionStore.subscribe((state, previousState) => {
        const isDragActive = !!state.dragState?.isDragging
        if (isDragActive === !!previousState.dragState?.isDragging) return
        updateDragActiveRefs(isDragActive)
      })
    }),
  )

  $effect(() => {
    const participation = dragParticipation
    const dragging = isDragging
    const id = itemId
    const transformElement = transform
    const ghostElement = ghost

    return untrack(() => {
      const cleanupDragStyles = () => {
        if (transformElement) {
          const style = transformElement.style
          setStyleIfChanged(style, 'transition', 'none')
          setStyleIfChanged(style, 'transform', '')
          setStyleIfChanged(style, 'pointerEvents', '')
          setStyleIfChanged(style, 'zIndex', '')
        }

        if (ghostElement) {
          setStyleIfChanged(ghostElement.style, 'display', 'none')
        }
      }

      const updateTransform = () => {
        if (!transformElement) return

        const currentParticipation = dragParticipationRef
        const isPartOfDrag = currentParticipation > 0 && !dragging
        const isAltPreviewDrag = currentParticipation === 2
        const shouldUpdatePreview = isPartOfDrag || isAltPreviewDrag

        if (!shouldUpdatePreview) {
          cleanupDragStyles()
          return
        }

        if (isAltPreviewDrag && isLargeAltDragCanvasItem(id)) {
          const style = transformElement.style
          setStyleIfChanged(style, 'transform', '')
          setStyleIfChanged(style, 'transition', 'none')
          setStyleIfChanged(style, 'pointerEvents', 'none')
          if (ghostElement) {
            setStyleIfChanged(ghostElement.style, 'display', 'none')
          }
          return
        }

        const offset = dragPreviewOffsetByItemRef.current[id] ?? dragOffsetRef.current

        if (isAltPreviewDrag) {
          const style = transformElement.style
          setStyleIfChanged(style, 'transform', '')
          setStyleIfChanged(style, 'transition', 'none')
          setStyleIfChanged(style, 'pointerEvents', 'none')

          if (ghostElement) {
            const ghostStyle = ghostElement.style
            setStyleIfChanged(ghostStyle, 'transform', `translate(${offset.x}px, ${offset.y}px)`)
            setStyleIfChanged(ghostStyle, 'display', 'block')
          }
        } else {
          const style = transformElement.style
          setStyleIfChanged(style, 'transform', `translate(${offset.x}px, ${offset.y}px)`)
          setStyleIfChanged(style, 'transition', 'none')
          setStyleIfChanged(style, 'pointerEvents', 'none')
          setStyleIfChanged(style, 'zIndex', '50')

          if (ghostElement) {
            setStyleIfChanged(ghostElement.style, 'display', 'none')
          }
        }
      }

      if (participation > 0 && (!dragging || participation === 2)) {
        if (participation === 2 && isLargeAltDragCanvasItem(id)) {
          updateTransform()
          return cleanupDragStyles
        }
        const visual: ActiveDragVisual = { update: updateTransform }
        registerDragVisual(visual)
        return () => {
          unregisterDragVisual(visual)
          cleanupDragStyles()
        }
      }

      cleanupDragStyles()
      return cleanupDragStyles
    })
  })

  $effect(() => {
    const dragging = isDragging
    const transformElement = transform
    untrack(() => {
      if (wasDragging && !dragging && transformElement) {
        transformElement.style.transition = 'none'
        requestAnimationFrame(() => {
          transformElement.style.transition = ''
        })
      }

      wasDragging = dragging
    })
  })

  $effect(() => () => {
    if (dragWasActiveTimeout) {
      clearTimeout(dragWasActiveTimeout)
    }
  })

  const isPartOfMultiDrag = $derived(dragParticipation > 0)
  const isAltDrag = $derived(dragParticipation === 2)
  const isPartOfDrag = $derived(isPartOfMultiDrag && !isDragging)
  const isBeingDragged = $derived(isDragging || isPartOfDrag)
  const shouldDimForDrag = $derived(
    shouldDimTimelineItemForDrag({
      isBeingDragged,
      isAltDrag,
      gestureMode,
    }),
  )

  return {
    get dragAffectsJoin() {
      return dragAffectsJoin.current
    },
    isAnyDragActiveRef,
    dragWasActiveRef,
    get isPartOfMultiDrag() {
      return isPartOfMultiDrag
    },
    get isAltDrag() {
      return isAltDrag
    },
    get isPartOfDrag() {
      return isPartOfDrag
    },
    get isBeingDragged() {
      return isBeingDragged
    },
    get shouldDimForDrag() {
      return shouldDimForDrag
    },
  }
}
