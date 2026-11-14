// SPDX-License-Identifier: MIT

import { select, shallow } from '$lib/store.svelte'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useLinkedEditPreviewStore } from '@/features/timeline/stores/linked-edit-preview-store'
import { useRippleEditPreviewStore } from '@/features/timeline/stores/ripple-edit-preview-store'
import { useRollingEditPreviewStore } from '@/features/timeline/stores/rolling-edit-preview-store'
import { useSlideEditPreviewStore } from '@/features/timeline/stores/slide-edit-preview-store'
import { useSlipEditPreviewStore } from '@/features/timeline/stores/slip-edit-preview-store'
import { useTrackPushPreviewStore } from '@/features/timeline/stores/track-push-preview-store'
import { getLinkedItemIds } from '@/features/timeline/utils/linked-items'
import type { PreviewItemUpdate } from '@/features/timeline/utils/item-edit-preview'

interface UseEditPreviewShiftsParams {
  item: TimelineItemType
  linkedItemsForSync: TimelineItemType[]
  isDragging: boolean
  isPartOfDrag: boolean
  gestureMode: string
}

interface SlidePreview {
  activeItemId: string | null
  primaryLeftNeighborId: string | null
  primaryRightNeighborId: string | null
  slideDelta: number
  minDelta: number
  maxDelta: number
  isPrimary: boolean
  isLeftNeighbor: boolean
  isRightNeighbor: boolean
}

export interface EditPreviewShifts {
  readonly linkedEditPreviewUpdate: PreviewItemUpdate | null
  readonly isHiddenByLinkedEditPreview: boolean
  readonly moveDragPreviewFromDelta: number
  readonly previewBaseItem: TimelineItemType
  readonly linkedSyncPreviewUpdatesById: Record<string, PreviewItemUpdate>

  readonly rollingEditDelta: number
  readonly rollingEditHandle: 'start' | 'end' | null
  readonly rollingEditConstrained: boolean

  readonly rippleEditOffset: number
  readonly rippleEdgeDelta: number

  readonly trackPushOffset: number

  readonly slipEditDelta: number
  readonly isLinkedSlipCompanion: boolean

  readonly slidePreview: SlidePreview
  readonly slideEditOffset: number
  readonly slideNeighborDelta: number
  readonly slideNeighborSide: 'left' | 'right' | null
  readonly isLinkedSlideCompanion: boolean
  readonly slideRange: { minDelta: number; maxDelta: number } | null
  readonly slideLeftNeighborIdForSlidItem: string | null
  readonly slideRightNeighborIdForSlidItem: string | null
  readonly slideLeftNeighborForSlidItem: TimelineItemType | null
  readonly slideRightNeighborForSlidItem: TimelineItemType | null
}

export function useEditPreviewShifts(params: () => UseEditPreviewShiftsParams): EditPreviewShifts {
  const item = $derived(params().item)
  const itemId = $derived(item.id)
  const linkedItemsForSync = $derived(params().linkedItemsForSync)
  const isDragging = $derived(params().isDragging)
  const isPartOfDrag = $derived(params().isPartOfDrag)
  const gestureMode = $derived(params().gestureMode)

  const linkedEditPreviewUpdateSelection = $derived.by(() => {
    const id = itemId
    return select(useLinkedEditPreviewStore, (s) => s.updatesById[id] ?? null)
  })
  const linkedEditPreviewUpdate = $derived(linkedEditPreviewUpdateSelection.current)
  const isHiddenByLinkedEditPreview = $derived(linkedEditPreviewUpdate?.hidden === true)

  const moveDragPreviewFromDelta = $derived.by(() => {
    if (!linkedEditPreviewUpdate || !(isDragging || isPartOfDrag) || gestureMode !== 'none') {
      return 0
    }
    return (linkedEditPreviewUpdate.from ?? item.from) - item.from
  })

  const previewBaseItem = $derived<TimelineItemType>(
    linkedEditPreviewUpdate && moveDragPreviewFromDelta === 0
      ? ({ ...item, ...linkedEditPreviewUpdate } as TimelineItemType)
      : item,
  )

  const linkedSyncPreviewUpdatesById = $derived.by(() => {
    const linkedItems = linkedItemsForSync
    return select(
      useLinkedEditPreviewStore,
      (s) => {
        const updatesById: Record<string, PreviewItemUpdate> = {}
        for (const linkedItem of linkedItems) {
          const linkedPreviewUpdate = s.updatesById[linkedItem.id]
          if (linkedPreviewUpdate) {
            updatesById[linkedItem.id] = linkedPreviewUpdate
          }
        }
        return updatesById
      },
      shallow,
    )
  })

  const rollingEditPreview = $derived.by(() => {
    const id = itemId
    return select(
      useRollingEditPreviewStore,
      (s) => {
        const isNeighbor = s.neighborItemId === id
        return {
          delta: isNeighbor ? s.neighborDelta : 0,
          handle: isNeighbor ? s.handle : null,
          constrained: isNeighbor && s.constrained,
        }
      },
      shallow,
    )
  })

  const rippleEditOffset = $derived.by(() => {
    const id = itemId
    return select(useRippleEditPreviewStore, (s) => {
      if (!s.trimmedItemId) return 0
      if (s.downstreamItemIds.has(id)) return s.delta
      return 0
    })
  })

  const rippleEdgeDelta = $derived.by(() => {
    const id = itemId
    return select(useRippleEditPreviewStore, (s) => {
      if (s.trimmedItemId !== id) return 0
      return s.delta
    })
  })

  const trackPushOffset = $derived.by(() => {
    const id = itemId
    return select(useTrackPushPreviewStore, (s) => {
      if (!s.anchorItemId) return 0
      if (s.shiftedItemIds.has(id)) return s.delta
      return 0
    })
  })

  const slipEditDelta = $derived.by(() => {
    const id = itemId
    return select(useSlipEditPreviewStore, (s) => {
      if (s.itemId !== id) return 0
      return s.slipDelta
    })
  })

  const isOtherSlipActive = $derived.by(() => {
    const id = itemId
    return select(useSlipEditPreviewStore, (s) => s.itemId !== null && s.itemId !== id)
  })
  const isLinkedSlipCompanion = $derived(
    isOtherSlipActive.current &&
      linkedEditPreviewUpdate !== null &&
      linkedEditPreviewUpdate.sourceStart !== undefined,
  )

  const slidePreviewSelection = $derived.by(() => {
    const id = itemId
    return select(
      useSlideEditPreviewStore,
      (s): SlidePreview => {
        const isPrimary = s.itemId === id
        const isLeftNeighbor = s.leftNeighborId === id
        const isRightNeighbor = s.rightNeighborId === id
        const isRelated = isPrimary || isLeftNeighbor || isRightNeighbor
        return {
          activeItemId: s.itemId,
          primaryLeftNeighborId: isPrimary ? s.leftNeighborId : null,
          primaryRightNeighborId: isPrimary ? s.rightNeighborId : null,
          slideDelta: isRelated ? s.slideDelta : 0,
          minDelta: s.minDelta,
          maxDelta: s.maxDelta,
          isPrimary,
          isLeftNeighbor,
          isRightNeighbor,
        }
      },
      shallow,
    )
  })
  const slidePreview = $derived(slidePreviewSelection.current)

  const slideEditOffset = $derived(slidePreview.isPrimary ? slidePreview.slideDelta : 0)
  const slideNeighborDelta = $derived(
    slidePreview.isLeftNeighbor || slidePreview.isRightNeighbor ? slidePreview.slideDelta : 0,
  )
  const slideNeighborSide = $derived<'left' | 'right' | null>(
    slidePreview.isLeftNeighbor ? 'left' : slidePreview.isRightNeighbor ? 'right' : null,
  )

  const slideActiveItemId = $derived(slidePreview.activeItemId)
  const slideIsPrimary = $derived(slidePreview.isPrimary)
  const slideIsLeftNeighbor = $derived(slidePreview.isLeftNeighbor)
  const slideIsRightNeighbor = $derived(slidePreview.isRightNeighbor)
  const slideMinDelta = $derived(slidePreview.minDelta)
  const slideMaxDelta = $derived(slidePreview.maxDelta)

  const isLinkedSlideCompanion = $derived.by(() => {
    if (!slideActiveItemId || slideIsPrimary) return false
    if (slideIsLeftNeighbor || slideIsRightNeighbor) return false
    const items = useItemsStore.getState().items
    const linkedIds = getLinkedItemIds(items, slideActiveItemId)
    return linkedIds.includes(itemId)
  })

  const slideRange = $derived(
    slideActiveItemId !== null ? { minDelta: slideMinDelta, maxDelta: slideMaxDelta } : null,
  )

  const slideLeftNeighborIdForSlidItem = $derived(slidePreview.primaryLeftNeighborId)
  const slideRightNeighborIdForSlidItem = $derived(slidePreview.primaryRightNeighborId)

  const slideLeftNeighborForSlidItem = $derived.by(() => {
    const neighborId = slideLeftNeighborIdForSlidItem
    return select(useItemsStore, (s) => {
      if (!neighborId) return null
      return s.itemById[neighborId] ?? null
    })
  })

  const slideRightNeighborForSlidItem = $derived.by(() => {
    const neighborId = slideRightNeighborIdForSlidItem
    return select(useItemsStore, (s) => {
      if (!neighborId) return null
      return s.itemById[neighborId] ?? null
    })
  })

  return {
    get linkedEditPreviewUpdate() {
      return linkedEditPreviewUpdate
    },
    get isHiddenByLinkedEditPreview() {
      return isHiddenByLinkedEditPreview
    },
    get moveDragPreviewFromDelta() {
      return moveDragPreviewFromDelta
    },
    get previewBaseItem() {
      return previewBaseItem
    },
    get linkedSyncPreviewUpdatesById() {
      return linkedSyncPreviewUpdatesById.current
    },
    get rollingEditDelta() {
      return rollingEditPreview.current.delta
    },
    get rollingEditHandle() {
      return rollingEditPreview.current.handle
    },
    get rollingEditConstrained() {
      return rollingEditPreview.current.constrained
    },
    get rippleEditOffset() {
      return rippleEditOffset.current
    },
    get rippleEdgeDelta() {
      return rippleEdgeDelta.current
    },
    get trackPushOffset() {
      return trackPushOffset.current
    },
    get slipEditDelta() {
      return slipEditDelta.current
    },
    get isLinkedSlipCompanion() {
      return isLinkedSlipCompanion
    },
    get slidePreview() {
      return slidePreview
    },
    get slideEditOffset() {
      return slideEditOffset
    },
    get slideNeighborDelta() {
      return slideNeighborDelta
    },
    get slideNeighborSide() {
      return slideNeighborSide
    },
    get isLinkedSlideCompanion() {
      return isLinkedSlideCompanion
    },
    get slideRange() {
      return slideRange
    },
    get slideLeftNeighborIdForSlidItem() {
      return slideLeftNeighborIdForSlidItem
    },
    get slideRightNeighborIdForSlidItem() {
      return slideRightNeighborIdForSlidItem
    },
    get slideLeftNeighborForSlidItem() {
      return slideLeftNeighborForSlidItem.current
    },
    get slideRightNeighborForSlidItem() {
      return slideRightNeighborForSlidItem.current
    },
  }
}
