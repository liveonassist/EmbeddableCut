// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import type { Transition } from '@/types/transition'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import { useRollHoverStore } from '@/features/timeline/stores/roll-hover-store'
import {
  resolveSmartBodyIntent,
  resolveSmartTrimIntent,
  SMART_TRIM_EDGE_ZONE_PX,
  SMART_TRIM_RETENTION_PX,
  SMART_TRIM_ROLL_ZONE_PX,
  smartTrimIntentToHandle,
  type SmartBodyIntent,
  type SmartTrimIntent,
} from '@/features/timeline/utils/smart-trim-zones'
import { hasTransitionBridgeAtHandle } from '@/features/timeline/utils/transition-edit-guards'
import { findHandleNeighborWithTransitions } from '@/features/timeline/utils/transition-linked-neighbors'
import { getTimelineClipLabelRowHeightPx } from './hover-layout'

const EDGE_HOVER_ZONE = SMART_TRIM_EDGE_ZONE_PX

interface UseSmartTrimHoverParams {
  item: TimelineItemType
  trackLocked: boolean
  activeTool: string
  activeToolRef: { readonly current: string }
  isAnyDragActiveRef: { current: boolean }
}

export interface SmartTrimHoverHandle {
  readonly hoveredEdge: 'start' | 'end' | null
  readonly smartTrimIntent: SmartTrimIntent
  readonly smartBodyIntent: SmartBodyIntent
  smartTrimIntentRef: { readonly current: SmartTrimIntent }
  handleMouseMove: (e: MouseEvent) => void
  handleMouseLeave: () => void
}

export function useSmartTrimHover(params: () => UseSmartTrimHoverParams): SmartTrimHoverHandle {
  const activeTool = $derived(params().activeTool)
  const itemId = $derived(params().item.id)

  let hoveredEdge = $state<'start' | 'end' | null>(null)
  let smartTrimIntent = $state<SmartTrimIntent>(null)
  let smartBodyIntent = $state<SmartBodyIntent>(null)

  const hoveredEdgeRef = { current: null as 'start' | 'end' | null }
  const smartTrimIntentRef = { current: null as SmartTrimIntent }
  const smartBodyIntentRef = { current: null as SmartBodyIntent }

  const syncHoveredEdge = (nextHoveredEdge: 'start' | 'end' | null) => {
    hoveredEdgeRef.current = nextHoveredEdge
    hoveredEdge = nextHoveredEdge
  }

  const syncSmartTrimIntent = (nextIntent: SmartTrimIntent) => {
    smartTrimIntentRef.current = nextIntent
    smartTrimIntent = nextIntent
  }

  const syncSmartBodyIntent = (nextIntent: SmartBodyIntent) => {
    smartBodyIntentRef.current = nextIntent
    smartBodyIntent = nextIntent
  }

  // Clear stale hover state when the active tool changes (mouse may be stationary)
  $effect(() => {
    void activeTool
    const id = itemId
    untrack(() => {
      syncHoveredEdge(null)
      syncSmartTrimIntent(null)
      syncSmartBodyIntent(null)
      useRollHoverStore.getState().clearRollHover(id)
    })
  })

  // Neighbor/bridge lookups are O(items + transitions); they only change when
  // the item, its track items or the transitions change, so cache them across
  // pointer moves instead of rescanning on every hover event.
  let trimNeighborInfo: {
    item: TimelineItemType
    items: TimelineItemType[]
    transitions: Transition[]
    hasLeftNeighbor: boolean
    hasRightNeighbor: boolean
    hasStartBridge: boolean
    hasEndBridge: boolean
  } | null = null

  const getTrimNeighborInfo = (
    item: TimelineItemType,
    items: TimelineItemType[],
    transitions: Transition[],
  ) => {
    const cached = trimNeighborInfo
    if (
      cached &&
      cached.item === item &&
      cached.items === items &&
      cached.transitions === transitions
    ) {
      return cached
    }
    const info = {
      item,
      items,
      transitions,
      hasLeftNeighbor: !!findHandleNeighborWithTransitions(item, 'start', items, transitions),
      hasRightNeighbor: !!findHandleNeighborWithTransitions(item, 'end', items, transitions),
      hasStartBridge: hasTransitionBridgeAtHandle(transitions, item.id, 'start'),
      hasEndBridge: hasTransitionBridgeAtHandle(transitions, item.id, 'end'),
    }
    trimNeighborInfo = info
    return info
  }

  const handleMouseMove = (e: MouseEvent) => {
    const { item, trackLocked, activeToolRef, isAnyDragActiveRef } = params()
    if (trackLocked || activeToolRef.current === 'razor' || isAnyDragActiveRef.current) {
      if (hoveredEdgeRef.current !== null) syncHoveredEdge(null)
      if (smartTrimIntentRef.current !== null) syncSmartTrimIntent(null)
      if (smartBodyIntentRef.current !== null) syncSmartBodyIntent(null)
      return
    }

    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const itemWidth = rect.width

    if (activeToolRef.current === 'trim-edit' || activeToolRef.current === 'select') {
      const items = useItemsStore.getState().items
      const transitions = useTransitionsStore.getState().transitions
      const { hasLeftNeighbor, hasRightNeighbor, hasStartBridge, hasEndBridge } =
        getTrimNeighborInfo(item, items, transitions)
      const nextIntent = resolveSmartTrimIntent({
        x,
        width: itemWidth,
        hasLeftNeighbor,
        hasRightNeighbor,
        hasStartBridge,
        hasEndBridge,
        preferRippleOuterEdges: activeToolRef.current === 'trim-edit',
        currentIntent: smartTrimIntentRef.current,
        edgeZonePx: SMART_TRIM_EDGE_ZONE_PX,
        rollZonePx: SMART_TRIM_ROLL_ZONE_PX,
        retentionPx: SMART_TRIM_RETENTION_PX,
      })
      const nextHoveredEdge = smartTrimIntentToHandle(nextIntent)

      if (smartTrimIntentRef.current !== nextIntent) {
        const prevIntent = smartTrimIntentRef.current
        syncSmartTrimIntent(nextIntent)
        if (nextIntent === 'roll-start') {
          const neighbor = findHandleNeighborWithTransitions(item, 'start', items, transitions)
          if (neighbor) useRollHoverStore.getState().setRollHover(item.id, neighbor.id, 'end')
        } else if (nextIntent === 'roll-end') {
          const neighbor = findHandleNeighborWithTransitions(item, 'end', items, transitions)
          if (neighbor) useRollHoverStore.getState().setRollHover(item.id, neighbor.id, 'start')
        } else if (prevIntent === 'roll-start' || prevIntent === 'roll-end') {
          useRollHoverStore.getState().clearRollHover(item.id)
        }
      }
      if (hoveredEdgeRef.current !== nextHoveredEdge) {
        syncHoveredEdge(nextHoveredEdge)
      }

      if (activeToolRef.current === 'select') {
        if (smartBodyIntentRef.current !== null) syncSmartBodyIntent(null)
        return
      }

      if (nextIntent) {
        if (smartBodyIntentRef.current !== null) syncSmartBodyIntent(null)
        return
      }

      const nextBodyIntent = resolveSmartBodyIntent({
        y,
        height: rect.height,
        labelRowHeight: getTimelineClipLabelRowHeightPx(target),
        isMediaItem: item.type === 'video' || item.type === 'audio' || item.type === 'composition',
        currentIntent: smartBodyIntentRef.current,
      })
      if (smartBodyIntentRef.current !== nextBodyIntent) {
        syncSmartBodyIntent(nextBodyIntent)
      }
      return
    }

    if (smartTrimIntentRef.current !== null) syncSmartTrimIntent(null)
    if (smartBodyIntentRef.current !== null) syncSmartBodyIntent(null)

    if (activeToolRef.current === 'rate-stretch') {
      if (hoveredEdgeRef.current !== null) syncHoveredEdge(null)
      return
    }

    if (x <= EDGE_HOVER_ZONE) {
      if (hoveredEdgeRef.current !== 'start') syncHoveredEdge('start')
    } else if (x >= itemWidth - EDGE_HOVER_ZONE) {
      if (hoveredEdgeRef.current !== 'end') syncHoveredEdge('end')
    } else {
      if (hoveredEdgeRef.current !== null) syncHoveredEdge(null)
    }
  }

  const handleMouseLeave = () => {
    syncHoveredEdge(null)
    syncSmartTrimIntent(null)
    syncSmartBodyIntent(null)
    useRollHoverStore.getState().clearRollHover(params().item.id)
  }

  return {
    get hoveredEdge() {
      return hoveredEdge
    },
    get smartTrimIntent() {
      return smartTrimIntent
    },
    get smartBodyIntent() {
      return smartBodyIntent
    },
    smartTrimIntentRef,
    handleMouseMove,
    handleMouseLeave,
  }
}
