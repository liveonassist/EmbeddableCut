// SPDX-License-Identifier: MIT

import {
  getTimelineScrubViewportProgress,
  notifyTimelineScrubVisualFrame,
} from '@/shared/timeline/live-scroll-sync'
import {
  beginTimelineSkimmerScrub,
  endTimelineSkimmerScrub,
} from '@/shared/timeline/main-timeline-scrub'
import {
  getEdgeScrollDelta,
  getPlayheadEdgeScrollVelocity,
} from '@/features/keyframes/deps/timeline-playhead'
import { useCoalescedScrub } from '../use-coalesced-scrub.svelte'
import { stateRef, type Ref } from '../ref-state.svelte'
import type { Viewport } from './dopesheet-types'
import { setPointerCaptureSafely } from './dopesheet-utils'
import { clampFrame } from './frame-utils'
import { getFrameFromAxisX } from './layout'

/** Frame under the pointer, derived from the live scroll geometry when available. */
function getLiveRulerFrame({
  viewportX,
  fallbackFrame,
  scrollContainer,
  livePixelsPerSecond,
  fps,
  itemFrom,
}: {
  viewportX: number
  fallbackFrame: number
  scrollContainer: HTMLElement | null | undefined
  livePixelsPerSecond: number | undefined
  fps: number
  itemFrom: number
}): number {
  if (!scrollContainer || !livePixelsPerSecond || livePixelsPerSecond <= 0) return fallbackFrame
  return Math.round(
    ((scrollContainer.scrollLeft + viewportX) / livePixelsPerSecond) * fps - itemFrom,
  )
}

function getDopesheetTimelineClientBounds(
  node: HTMLElement,
  borderWidth: number,
  timelineWidth: number,
): { left: number; right: number } {
  const left = node.getBoundingClientRect().left + borderWidth
  return { left, right: left + timelineWidth }
}

type RulerPointerEvent = PointerEvent & { currentTarget: HTMLDivElement }

export interface UseRulerScrubParams {
  disabled: boolean
  viewport: Viewport
  effectiveTimelineWidth: number
  timelinePixelsPerSecond: number
  fps: number
  itemFrom: number
  totalFrames: number
  timelineEdgeInset: number | undefined
  timelineCellBorderWidth: number
  scrubClampToItemBounds: boolean
  scrubFrameBounds: { minFrame: number; maxFrame: number } | null | undefined
  frameToX: (frame: number) => number
  globalFrameToPixels?: (frame: number) => number
  getTimelineXFromClientX: (clientX: number) => number
  getFrameFromClientX: (clientX: number) => number
  getLiveDragPixelsPerFrame: () => number
  getTimelineLivePixelsPerSecond?: () => number | undefined
  timelineRef: Ref<HTMLDivElement | null>
  timelineScrollContainerRef?: Ref<HTMLElement | null>
  onScrub?: (frame: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  onSkim?: (frame: number | null) => void
  /** Applies a horizontal scroll of the linked timeline; returns pixels applied. */
  onRulerEdgeScroll?: (deltaPixels: number) => number
}

export interface RulerScrub {
  readonly isRulerScrubbing: boolean
  rulerScrubActiveRef: Ref<boolean>
  rulerScrubHandoffFrameRef: Ref<number | null>
  handleRulerPointerDown: (event: RulerPointerEvent) => void
  handleRulerPointerMove: (event: RulerPointerEvent) => void
  handleRulerPointerLeave: () => void
  handleRulerPointerUp: (event: RulerPointerEvent) => void
}

/**
 * Ruler scrubbing for the dopesheet: the pointer drags the playhead, and holding
 * it near either edge auto-scrolls the linked timeline on an animation frame while
 * the scrub follows the scroll.
 *
 * While no drag is active the scrub viewport is the current viewport; a drag
 * pins it at pointer-down and shifts it with each edge scroll. The rAF loop
 * reads the latest geometry through `params()` on every tick.
 */
export function useRulerScrub(params: () => UseRulerScrubParams): RulerScrub {
  const rulerScrubActiveRef: Ref<boolean> = { current: false }
  const rulerScrubHandoffFrameRef: Ref<number | null> = { current: null }
  // Gesture bookkeeping, mutated from pointer handlers and frames.
  const scrub: {
    scrubPointerId: number | null
    lastScrubbedFrame: number | null
    rulerScrubClientX: number | null
    dragViewport: Viewport | null
    rulerEdgeScrollRaf: number | null
    rulerEdgeScrollTimestamp: number | null
  } = {
    scrubPointerId: null,
    lastScrubbedFrame: null,
    rulerScrubClientX: null,
    dragViewport: null,
    rulerEdgeScrollRaf: null,
    rulerEdgeScrollTimestamp: null,
  }
  const rulerScrubbing = stateRef(false)
  const skimmerScrubOwner = {}

  const getRulerScrubViewport = (p: UseRulerScrubParams): Viewport =>
    scrub.scrubPointerId === null || scrub.dragViewport === null ? p.viewport : scrub.dragViewport

  const getRulerFrameViewportX = (p: UseRulerScrubParams, frame: number) => {
    const mappedX = p.globalFrameToPixels
      ? p.globalFrameToPixels(p.itemFrom + frame)
      : p.frameToX(frame)
    return Math.max(0, Math.min(p.effectiveTimelineWidth - 1, mappedX))
  }

  const getRulerScrubVisualX = (p: UseRulerScrubParams, clientX: number) => {
    const pointerX = p.getTimelineXFromClientX(clientX)
    if (p.scrubClampToItemBounds) {
      return Math.max(
        getRulerFrameViewportX(p, 0),
        Math.min(getRulerFrameViewportX(p, Math.max(0, p.totalFrames - 1)), pointerX),
      )
    }
    if (p.scrubFrameBounds) {
      return Math.max(
        getRulerFrameViewportX(p, p.scrubFrameBounds.minFrame),
        Math.min(getRulerFrameViewportX(p, p.scrubFrameBounds.maxFrame), pointerX),
      )
    }
    return pointerX
  }

  const notifyLinkedTimelineScrubFrame = (p: UseRulerScrubParams, frame: number, clientX: number) =>
    notifyTimelineScrubVisualFrame(p.timelineScrollContainerRef?.current, {
      frame: p.itemFrom + frame,
      source: 'keyframe',
      viewportProgress: getTimelineScrubViewportProgress(
        getRulerScrubVisualX(p, clientX),
        p.effectiveTimelineWidth - 1,
      ),
    })

  const {
    startScrub: startRulerScrub,
    queueScrub: queueRulerScrub,
    flushPendingScrub: flushPendingRulerScrub,
  } = useCoalescedScrub(() => (frame: number) => params().onScrub?.(frame))

  const getRulerScrubFrameFromClientX = (p: UseRulerScrubParams, clientX: number) => {
    const viewportX = p.getTimelineXFromClientX(clientX)
    const fallbackFrame = getFrameFromAxisX(
      viewportX,
      getRulerScrubViewport(p),
      p.effectiveTimelineWidth,
      p.timelineEdgeInset,
    )
    const frame = getLiveRulerFrame({
      viewportX,
      fallbackFrame,
      scrollContainer: p.timelineScrollContainerRef?.current,
      livePixelsPerSecond: p.getTimelineLivePixelsPerSecond?.(),
      fps: p.fps,
      itemFrom: p.itemFrom,
    })
    if (p.scrubClampToItemBounds) return clampFrame(frame, p.totalFrames)
    if (!p.scrubFrameBounds) return frame
    return Math.max(p.scrubFrameBounds.minFrame, Math.min(p.scrubFrameBounds.maxFrame, frame))
  }

  const rulerEdgeScrollLoop = (timestamp: number) => {
    scrub.rulerEdgeScrollRaf = null
    const p = params()
    const clientX = scrub.rulerScrubClientX
    const node = p.timelineRef.current
    if (scrub.scrubPointerId === null || clientX === null || !node || !p.onRulerEdgeScroll) {
      return
    }

    const bounds = getDopesheetTimelineClientBounds(
      node,
      p.timelineCellBorderWidth,
      p.effectiveTimelineWidth,
    )
    const velocity = getPlayheadEdgeScrollVelocity(clientX, bounds)
    if (velocity !== 0) {
      const previousTimestamp = scrub.rulerEdgeScrollTimestamp ?? timestamp - 1000 / 60
      const appliedPixels = p.onRulerEdgeScroll(
        getEdgeScrollDelta(velocity, timestamp, previousTimestamp),
      )
      if (appliedPixels !== 0 && p.effectiveTimelineWidth > 0) {
        const liveViewport = getRulerScrubViewport(p)
        const frameDelta = appliedPixels / p.getLiveDragPixelsPerFrame()
        scrub.dragViewport = {
          startFrame: liveViewport.startFrame + frameDelta,
          endFrame: liveViewport.endFrame + frameDelta,
        }
        const frame = getRulerScrubFrameFromClientX(p, clientX)
        scrub.lastScrubbedFrame = frame
        notifyLinkedTimelineScrubFrame(p, frame, clientX)
        queueRulerScrub({
          frame,
          pointerX: p.getTimelineXFromClientX(clientX),
          pixelsPerSecond: p.timelinePixelsPerSecond,
        })
      }
      scrub.rulerEdgeScrollTimestamp = timestamp
    } else {
      scrub.rulerEdgeScrollTimestamp = null
    }

    scrub.rulerEdgeScrollRaf = requestAnimationFrame(rulerEdgeScrollLoop)
  }

  const cancelRulerEdgeScroll = () => {
    if (scrub.rulerEdgeScrollRaf === null) return
    cancelAnimationFrame(scrub.rulerEdgeScrollRaf)
    scrub.rulerEdgeScrollRaf = null
  }

  $effect(() => {
    return () => {
      if (scrub.rulerEdgeScrollRaf !== null) {
        cancelAnimationFrame(scrub.rulerEdgeScrollRaf)
      }
      if (scrub.scrubPointerId !== null) {
        rulerScrubActiveRef.current = false
      }
      endTimelineSkimmerScrub(skimmerScrubOwner)
    }
  })

  const handleRulerPointerDown = (event: RulerPointerEvent) => {
    const p = params()
    if (p.disabled || event.button !== 0) return
    event.preventDefault()
    rulerScrubHandoffFrameRef.current = null
    rulerScrubActiveRef.current = true
    beginTimelineSkimmerScrub(skimmerScrubOwner)
    rulerScrubbing.current = true
    scrub.scrubPointerId = event.pointerId
    scrub.rulerScrubClientX = event.clientX
    scrub.dragViewport = p.viewport
    scrub.rulerEdgeScrollTimestamp = null
    setPointerCaptureSafely(event.currentTarget, event.pointerId)
    const frame = getRulerScrubFrameFromClientX(p, event.clientX)
    scrub.lastScrubbedFrame = frame
    notifyLinkedTimelineScrubFrame(p, frame, event.clientX)
    p.onScrubStart?.()
    startRulerScrub({
      frame,
      pointerX: p.getTimelineXFromClientX(event.clientX),
      pixelsPerSecond: p.timelinePixelsPerSecond,
    })
    if (p.onRulerEdgeScroll && scrub.rulerEdgeScrollRaf === null) {
      scrub.rulerEdgeScrollRaf = requestAnimationFrame(rulerEdgeScrollLoop)
    }
  }

  const handleRulerPointerMove = (event: RulerPointerEvent) => {
    const p = params()
    if (p.disabled) return
    const frame = p.getFrameFromClientX(event.clientX)
    p.onSkim?.(frame)
    if (scrub.scrubPointerId !== event.pointerId) return
    scrub.rulerScrubClientX = event.clientX
    const scrubFrame = getRulerScrubFrameFromClientX(p, event.clientX)
    notifyLinkedTimelineScrubFrame(p, scrubFrame, event.clientX)
    if (scrubFrame === scrub.lastScrubbedFrame) return
    scrub.lastScrubbedFrame = scrubFrame
    queueRulerScrub({
      frame: scrubFrame,
      pointerX: p.getTimelineXFromClientX(event.clientX),
      pixelsPerSecond: p.timelinePixelsPerSecond,
    })
  }

  const handleRulerPointerLeave = () => {
    if (scrub.scrubPointerId === null) params().onSkim?.(null)
  }

  const handleRulerPointerUp = (event: RulerPointerEvent) => {
    if (scrub.scrubPointerId !== event.pointerId) return
    const p = params()
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore pointer capture errors
    }
    const finalFrame = getRulerScrubFrameFromClientX(p, event.clientX)
    rulerScrubHandoffFrameRef.current = finalFrame
    notifyLinkedTimelineScrubFrame(p, finalFrame, event.clientX)
    if (finalFrame !== scrub.lastScrubbedFrame) {
      queueRulerScrub({
        frame: finalFrame,
        pointerX: p.getTimelineXFromClientX(event.clientX),
        pixelsPerSecond: p.timelinePixelsPerSecond,
      })
    }
    cancelRulerEdgeScroll()
    rulerScrubbing.current = false
    scrub.scrubPointerId = null
    scrub.dragViewport = null
    scrub.rulerScrubClientX = null
    scrub.rulerEdgeScrollTimestamp = null
    scrub.lastScrubbedFrame = null
    flushPendingRulerScrub(true)
    rulerScrubActiveRef.current = false
    p.onScrubEnd?.()
    endTimelineSkimmerScrub(skimmerScrubOwner)
  }

  return {
    get isRulerScrubbing() {
      return rulerScrubbing.current
    },
    rulerScrubActiveRef,
    rulerScrubHandoffFrameRef,
    handleRulerPointerDown,
    handleRulerPointerMove,
    handleRulerPointerLeave,
    handleRulerPointerUp,
  }
}
