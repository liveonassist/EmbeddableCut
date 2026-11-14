// SPDX-License-Identifier: MIT

/**
 * Dopesheet marquee hook.
 * Owns the marquee rectangle, the in-progress drag-select state, the
 * click-dedup flag, and the global pointer listeners that drive both
 * marquee dragging and the auto-scroll-on-edge behavior. Started by
 * the orchestrator's row / timeline-background pointer-down handlers
 * via beginMarqueeSelection.
 */

import { untrack } from 'svelte'
import { KEYFRAME_MARQUEE_THRESHOLD, type KeyframeMarqueeRect } from '../keyframe-marquee'
import { resolveMarqueeSelection } from '../marquee-selection'
import type { Ref } from '../ref-state.svelte'
import { MARQUEE_SCROLL_EDGE_PX, MARQUEE_SCROLL_MAX_SPEED } from './dopesheet-constants'
import { KEYFRAME_EDGE_INSET } from './layout'
import { addWindowPointerListeners } from './dopesheet-pointer-listeners'
import type { MarqueeMode, MarqueeState } from './dopesheet-types'

interface KeyframePoint {
  keyframeId: string
  x: number
  y: number
}

export interface UseDopesheetMarqueeOptions {
  getKeyframePoints: () => KeyframePoint[]
  scrollAreaRef: Ref<HTMLDivElement | null>
  getTimelineXFromClientX: (clientX: number) => number
  getContentYFromClientY: (clientY: number) => number
  onSelectionChange?: (
    keyframeIds: Set<string>,
    options?: { preserveExternalSelection?: boolean },
  ) => void
  onSelectionPreviewChange?: (keyframeIds: Set<string> | null) => void
}

export interface UseDopesheetMarqueeReturn {
  /** Attach with `bind:ref={marqueeOverlayRef.current}` on the persistent overlay. */
  marqueeOverlayRef: Ref<HTMLDivElement | null>
  marqueeStateRef: Ref<MarqueeState | null>
  getMarqueeModeFromPointerEvent: (
    event: Pick<PointerEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  ) => MarqueeMode
  beginMarqueeSelection: (
    pointerId: number,
    clientX: number,
    clientY: number,
    mode: MarqueeMode,
    baseSelection: Set<string>,
  ) => void
}

export function useDopesheetMarquee(
  options: () => UseDopesheetMarqueeOptions,
): UseDopesheetMarqueeReturn {
  const marqueeOverlayRef: Ref<HTMLDivElement | null> = { current: null }
  const marqueeStateRef: Ref<MarqueeState | null> = { current: null }
  let marqueePoints: KeyframePoint[] = []
  let marqueePreviewSelection: Set<string> | null = null
  let latestPointer: { pointerId: number; clientX: number; clientY: number } | null = null
  let marqueeFrame: number | null = null

  const hideMarqueeOverlay = () => {
    const overlay = marqueeOverlayRef.current
    if (!overlay) return
    overlay.hidden = true
    overlay.style.cssText = ''
  }

  const clearSelectionPreview = () => {
    if (!marqueePreviewSelection) return
    marqueePreviewSelection = null
    options().onSelectionPreviewChange?.(null)
  }

  const getMarqueeModeFromPointerEvent = (
    event: Pick<PointerEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  ): MarqueeMode => (event.shiftKey ? 'add' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace')

  const beginMarqueeSelection = (
    pointerId: number,
    clientX: number,
    clientY: number,
    mode: MarqueeMode,
    baseSelection: Set<string>,
  ) => {
    if (marqueeFrame !== null) {
      cancelAnimationFrame(marqueeFrame)
      marqueeFrame = null
    }
    hideMarqueeOverlay()
    clearSelectionPreview()
    const { getTimelineXFromClientX, getContentYFromClientY } = options()
    const startX = getTimelineXFromClientX(clientX)
    const startY = getContentYFromClientY(clientY)
    marqueePoints = []
    marqueeStateRef.current = {
      pointerId,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      mode,
      baseSelection,
      started: false,
    }
    latestPointer = { pointerId, clientX, clientY }
  }

  const resolveSelectionFromMarquee = (
    state: MarqueeState,
  ): { rect: KeyframeMarqueeRect; selection: Set<string> } => {
    const minX = Math.min(state.startX, state.currentX)
    const maxX = Math.max(state.startX, state.currentX)
    const minY = Math.min(state.startY, state.currentY)
    const maxY = Math.max(state.startY, state.currentY)

    // Partial hit: select when the marquee overlaps any part of the keyframe
    // diamond (its rendered half-extent), not only when it covers the center.
    const r = KEYFRAME_EDGE_INSET
    const hitIds = new Set<string>()
    for (const point of marqueePoints) {
      if (
        point.x + r >= minX &&
        point.x - r <= maxX &&
        point.y + r >= minY &&
        point.y - r <= maxY
      ) {
        hitIds.add(point.keyframeId)
      }
    }

    return {
      rect: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      },
      selection: resolveMarqueeSelection(state.mode, state.baseSelection, hitIds),
    }
  }

  const renderMarqueePreview = (state: MarqueeState) => {
    const { rect, selection } = resolveSelectionFromMarquee(state)
    const overlay = marqueeOverlayRef.current
    if (overlay) {
      overlay.hidden = false
      overlay.style.cssText = `transform:translate3d(${rect.x}px,${rect.y}px,0);width:${rect.width}px;height:${rect.height}px`
    }

    const previous = marqueePreviewSelection
    if (
      previous &&
      previous.size === selection.size &&
      [...previous].every((keyframeId) => selection.has(keyframeId))
    ) {
      return
    }
    marqueePreviewSelection = selection
    options().onSelectionPreviewChange?.(selection)
  }

  // The window listeners live for the hook's lifetime and read the latest
  // collaborators through `options()` on each event.
  $effect(() =>
    untrack(() => {
      const applyEdgeScroll = (clientY: number): boolean => {
        const scrollNode = options().scrollAreaRef.current
        if (!scrollNode) return false
        const rect = scrollNode.getBoundingClientRect()
        const topEdge = rect.top + MARQUEE_SCROLL_EDGE_PX
        const bottomEdge = rect.bottom - MARQUEE_SCROLL_EDGE_PX
        let scrollDelta = 0

        if (clientY < topEdge) {
          const intensity = Math.min(1, (topEdge - clientY) / MARQUEE_SCROLL_EDGE_PX)
          scrollDelta = -Math.max(1, Math.round(intensity * MARQUEE_SCROLL_MAX_SPEED))
        } else if (clientY > bottomEdge) {
          const intensity = Math.min(1, (clientY - bottomEdge) / MARQUEE_SCROLL_EDGE_PX)
          scrollDelta = Math.max(1, Math.round(intensity * MARQUEE_SCROLL_MAX_SPEED))
        }

        if (scrollDelta === 0) return false
        const previousScrollTop = scrollNode.scrollTop
        const maxScrollTop = Math.max(0, scrollNode.scrollHeight - scrollNode.clientHeight)
        scrollNode.scrollTop = Math.max(0, Math.min(maxScrollTop, previousScrollTop + scrollDelta))
        return scrollNode.scrollTop !== previousScrollTop
      }

      const updateMarqueePosition = (clientX: number, clientY: number) => {
        const marqueeState = marqueeStateRef.current
        if (!marqueeState) return
        const { getTimelineXFromClientX, getContentYFromClientY, getKeyframePoints } = options()
        const x = getTimelineXFromClientX(clientX)
        const y = getContentYFromClientY(clientY)
        const movedEnough =
          Math.abs(x - marqueeState.startX) > KEYFRAME_MARQUEE_THRESHOLD ||
          Math.abs(y - marqueeState.startY) > KEYFRAME_MARQUEE_THRESHOLD
        if (!marqueeState.started && movedEnough) {
          marqueeState.started = true
          marqueePoints = getKeyframePoints()
        }
        if (!marqueeState.started) return

        marqueeState.currentX = x
        marqueeState.currentY = y
        renderMarqueePreview(marqueeState)
      }

      const runMarqueeFrame = () => {
        marqueeFrame = null
        const pointer = latestPointer
        const marqueeState = marqueeStateRef.current
        if (!pointer || !marqueeState || pointer.pointerId !== marqueeState.pointerId) {
          return
        }

        const didScroll = applyEdgeScroll(pointer.clientY)
        updateMarqueePosition(pointer.clientX, pointer.clientY)
        if (didScroll) {
          marqueeFrame = requestAnimationFrame(runMarqueeFrame)
        }
      }

      const scheduleMarqueeFrame = () => {
        if (marqueeFrame !== null) return
        marqueeFrame = requestAnimationFrame(runMarqueeFrame)
      }

      const cancelMarqueeFrame = () => {
        if (marqueeFrame === null) return
        cancelAnimationFrame(marqueeFrame)
        marqueeFrame = null
      }

      const handlePointerMove = (event: PointerEvent) => {
        const marqueeState = marqueeStateRef.current
        if (!marqueeState || marqueeState.pointerId !== event.pointerId) return
        latestPointer = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        }
        scheduleMarqueeFrame()
      }

      const handlePointerUp = (event: PointerEvent) => {
        const marqueeState = marqueeStateRef.current
        if (!marqueeState || marqueeState.pointerId !== event.pointerId) return
        cancelMarqueeFrame()
        updateMarqueePosition(event.clientX, event.clientY)
        const { onSelectionChange } = options()
        if (marqueeState.started) {
          const { selection } = resolveSelectionFromMarquee(marqueeState)
          onSelectionChange?.(selection, {
            preserveExternalSelection: marqueeState.mode !== 'replace',
          })
        } else if (marqueeState.mode === 'replace') {
          onSelectionChange?.(new Set(), { preserveExternalSelection: false })
        }
        marqueeStateRef.current = null
        latestPointer = null
        marqueePoints = []
        hideMarqueeOverlay()
        clearSelectionPreview()
      }

      const handlePointerCancel = (event: PointerEvent) => {
        const marqueeState = marqueeStateRef.current
        if (!marqueeState || marqueeState.pointerId !== event.pointerId) return
        cancelMarqueeFrame()
        marqueeStateRef.current = null
        latestPointer = null
        marqueePoints = []
        hideMarqueeOverlay()
        clearSelectionPreview()
      }

      const removeListeners = addWindowPointerListeners(
        handlePointerMove,
        handlePointerUp,
        handlePointerCancel,
      )
      return () => {
        removeListeners()
        cancelMarqueeFrame()
        hideMarqueeOverlay()
        clearSelectionPreview()
      }
    }),
  )

  return {
    marqueeOverlayRef,
    marqueeStateRef,
    getMarqueeModeFromPointerEvent,
    beginMarqueeSelection,
  }
}
