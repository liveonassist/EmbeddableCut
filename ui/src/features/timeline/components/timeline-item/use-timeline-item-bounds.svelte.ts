// SPDX-License-Identifier: MIT

import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { frameToPixelsNow } from '@/features/timeline/utils/zoom-conversions'
import { isMediaItem, timelineToSourceFrames } from '@/features/timeline/utils/source-calculations'
import { computeSlideContinuitySourceDelta } from '@/features/timeline/utils/slide-utils'

interface RateStretchVisualFeedback {
  from: number
  duration: number
  speed: number
}

interface UseTimelineItemBoundsParams {
  previewBaseItem: TimelineItemType
  fps: number

  // Trim state
  isTrimming: boolean
  trimHandle: 'start' | 'end' | null
  trimDelta: number

  // Stretch state
  isStretching: boolean
  stretchFeedback: RateStretchVisualFeedback | null

  // Slip/slide
  isSlipSlideActive: boolean
  slipEditDelta: number
  slideEditOffset: number
  slideNeighborSide: 'left' | 'right' | null
  slideNeighborDelta: number
  slideLeftNeighborForSlidItem: TimelineItemType | null
  slideRightNeighborForSlidItem: TimelineItemType | null

  // Rolling/ripple/track-push
  rollingEditDelta: number
  rollingEditHandle: 'start' | 'end' | null
  rippleEditOffset: number
  rippleEdgeDelta: number
  trackPushOffset: number
}

export interface TimelineItemBounds {
  readonly leftFrame: number
  readonly rightFrame: number
  readonly left: number
  readonly right: number
  readonly width: number
  readonly visualLeftFrame: number
  readonly visualWidthFrames: number
  readonly visualLeft: number
  readonly visualWidth: number
  readonly slideFromOffset: number
  readonly slideDurationOffset: number
  readonly contentPreviewItem: TimelineItemType
  readonly preferImmediateContentRendering: boolean
  readonly effectiveSourceFps: number
}

/**
 * Pixel values convert through the zoom at read time (FreeCut computes them on
 * every render without subscribing to zoom), so the getters below call
 * `frameToPixelsNow` when read rather than caching it in a `$derived`.
 */
export function useTimelineItemBounds(
  params: () => UseTimelineItemBoundsParams,
): TimelineItemBounds {
  const previewBaseItem = $derived(params().previewBaseItem)
  const fps = $derived(params().fps)
  const isTrimming = $derived(params().isTrimming)
  const trimHandle = $derived(params().trimHandle)
  const trimDelta = $derived(params().trimDelta)
  const isStretching = $derived(params().isStretching)
  const stretchFeedback = $derived(params().stretchFeedback)
  const isSlipSlideActive = $derived(params().isSlipSlideActive)
  const slipEditDelta = $derived(params().slipEditDelta)
  const slideEditOffset = $derived(params().slideEditOffset)
  const slideNeighborSide = $derived(params().slideNeighborSide)
  const slideNeighborDelta = $derived(params().slideNeighborDelta)
  const slideLeftNeighborForSlidItem = $derived(params().slideLeftNeighborForSlidItem)
  const slideRightNeighborForSlidItem = $derived(params().slideRightNeighborForSlidItem)
  const rollingEditDelta = $derived(params().rollingEditDelta)
  const rollingEditHandle = $derived(params().rollingEditHandle)
  const rippleEditOffset = $derived(params().rippleEditOffset)
  const rippleEdgeDelta = $derived(params().rippleEdgeDelta)
  const trackPushOffset = $derived(params().trackPushOffset)

  const slideFromOffset = $derived(
    slideEditOffset + (slideNeighborSide === 'right' ? slideNeighborDelta : 0),
  )
  const slideDurationOffset = $derived(
    (slideNeighborSide === 'left' ? slideNeighborDelta : 0) +
      (slideNeighborSide === 'right' ? -slideNeighborDelta : 0),
  )

  const leftFrame = $derived(
    previewBaseItem.from + slideFromOffset + rippleEditOffset + trackPushOffset,
  )
  const rightFrame = $derived(
    previewBaseItem.from +
      previewBaseItem.durationInFrames +
      slideDurationOffset +
      slideFromOffset +
      rippleEditOffset +
      trackPushOffset,
  )

  const effectiveSourceFps = $derived(previewBaseItem.sourceFps ?? fps)

  const contentPreviewItem = $derived.by<TimelineItemType>(() => {
    let nextItem = previewBaseItem
    let previewStartTrimDelta = 0
    let previewEndTrimDelta = 0
    let previewDurationDelta = 0

    if (isTrimming && trimHandle) {
      if (trimHandle === 'start') {
        previewStartTrimDelta += trimDelta
        previewDurationDelta += -trimDelta
      } else {
        previewEndTrimDelta += trimDelta
        previewDurationDelta += trimDelta
      }
    }

    if (rollingEditDelta !== 0) {
      if (rollingEditHandle === 'end') {
        previewStartTrimDelta += rollingEditDelta
        previewDurationDelta += -rollingEditDelta
      } else if (rollingEditHandle === 'start') {
        previewEndTrimDelta += rollingEditDelta
        previewDurationDelta += rollingEditDelta
      }
    }

    if (slideNeighborSide && slideNeighborDelta !== 0) {
      if (slideNeighborSide === 'right') {
        previewStartTrimDelta += slideNeighborDelta
        previewDurationDelta += -slideNeighborDelta
      } else {
        previewEndTrimDelta += slideNeighborDelta
        previewDurationDelta += slideNeighborDelta
      }
    }

    if (isMediaItem(nextItem) && slideEditOffset !== 0) {
      const sourceDelta = computeSlideContinuitySourceDelta(
        nextItem,
        slideLeftNeighborForSlidItem,
        slideRightNeighborForSlidItem,
        slideEditOffset,
        fps,
      )
      if (sourceDelta !== 0 && nextItem.sourceEnd !== undefined) {
        nextItem = {
          ...nextItem,
          sourceStart: (nextItem.sourceStart ?? 0) + sourceDelta,
          sourceEnd: nextItem.sourceEnd + sourceDelta,
        }
      }
    }

    if (isMediaItem(previewBaseItem) && slipEditDelta !== 0) {
      const nextSourceStart = Math.max(0, (nextItem.sourceStart ?? 0) + slipEditDelta)
      const nextSourceEnd =
        nextItem.sourceEnd !== undefined
          ? Math.max(nextSourceStart + 1, nextItem.sourceEnd + slipEditDelta)
          : undefined

      nextItem = {
        ...nextItem,
        sourceStart: nextSourceStart,
        sourceEnd: nextSourceEnd,
      }
    }

    const isCompositionWrapper =
      nextItem.type === 'composition' || (nextItem.type === 'audio' && !!nextItem.compositionId)

    const supportsStartTrimSourceShift =
      previewBaseItem.type === 'video' || previewBaseItem.type === 'audio' || isCompositionWrapper
    if (supportsStartTrimSourceShift && previewStartTrimDelta !== 0) {
      const sourceFramesDelta = timelineToSourceFrames(
        previewStartTrimDelta,
        nextItem.speed ?? 1,
        fps,
        effectiveSourceFps,
      )
      nextItem = {
        ...nextItem,
        sourceStart: Math.max(0, (nextItem.sourceStart ?? 0) + sourceFramesDelta),
      }
    }

    if (previewDurationDelta !== 0) {
      nextItem = {
        ...nextItem,
        durationInFrames: Math.max(1, nextItem.durationInFrames + previewDurationDelta),
      }
    }

    if (isCompositionWrapper && previewEndTrimDelta !== 0 && nextItem.sourceEnd !== undefined) {
      const endSourceFramesDelta = timelineToSourceFrames(
        previewEndTrimDelta,
        nextItem.speed ?? 1,
        fps,
        effectiveSourceFps,
      )
      nextItem = {
        ...nextItem,
        sourceEnd: Math.max(
          (nextItem.sourceStart ?? 0) + 1,
          nextItem.sourceEnd + endSourceFramesDelta,
        ),
      }
    }

    return nextItem
  })

  const preferImmediateContentRendering = $derived(
    isTrimming ||
      isSlipSlideActive ||
      rollingEditDelta !== 0 ||
      rippleEditOffset !== 0 ||
      rippleEdgeDelta !== 0 ||
      slideEditOffset !== 0 ||
      slideNeighborDelta !== 0,
  )

  const visualFrames = $derived.by(() => {
    let trimVisualLeftFrame = leftFrame
    let trimVisualRightFrame = rightFrame

    if (rippleEdgeDelta !== 0) {
      trimVisualRightFrame =
        previewBaseItem.from + previewBaseItem.durationInFrames + rippleEdgeDelta
    } else if (isTrimming && trimHandle) {
      if (trimHandle === 'start') {
        trimVisualLeftFrame = previewBaseItem.from + trimDelta
      } else {
        trimVisualRightFrame = previewBaseItem.from + previewBaseItem.durationInFrames + trimDelta
      }
    }

    if (rollingEditDelta !== 0) {
      if (rollingEditHandle === 'end') {
        trimVisualLeftFrame = previewBaseItem.from + rollingEditDelta
      } else if (rollingEditHandle === 'start') {
        trimVisualRightFrame =
          previewBaseItem.from + previewBaseItem.durationInFrames + rollingEditDelta
      }
    }

    let stretchVisualLeftFrame = trimVisualLeftFrame
    let stretchVisualRightFrame = trimVisualRightFrame

    if (isStretching && stretchFeedback) {
      stretchVisualLeftFrame = stretchFeedback.from
      stretchVisualRightFrame = stretchFeedback.from + stretchFeedback.duration
    }

    const isActive = rippleEdgeDelta !== 0 || isTrimming || rollingEditDelta !== 0
    const nextVisualLeftFrame = isStretching
      ? stretchVisualLeftFrame
      : isActive
        ? trimVisualLeftFrame
        : leftFrame
    const nextVisualRightFrame = isStretching
      ? stretchVisualRightFrame
      : isActive
        ? trimVisualRightFrame
        : rightFrame

    return {
      visualLeftFrame: nextVisualLeftFrame,
      visualWidthFrames: Math.max(1, nextVisualRightFrame - nextVisualLeftFrame),
    }
  })

  return {
    get leftFrame() {
      return leftFrame
    },
    get rightFrame() {
      return rightFrame
    },
    get left() {
      return Math.round(frameToPixelsNow(leftFrame))
    },
    get right() {
      return Math.round(frameToPixelsNow(rightFrame))
    },
    get width() {
      return Math.round(frameToPixelsNow(rightFrame)) - Math.round(frameToPixelsNow(leftFrame))
    },
    get visualLeftFrame() {
      return visualFrames.visualLeftFrame
    },
    get visualWidthFrames() {
      return visualFrames.visualWidthFrames
    },
    get visualLeft() {
      return Math.round(frameToPixelsNow(visualFrames.visualLeftFrame))
    },
    get visualWidth() {
      return Math.round(frameToPixelsNow(visualFrames.visualWidthFrames))
    },
    get slideFromOffset() {
      return slideFromOffset
    },
    get slideDurationOffset() {
      return slideDurationOffset
    },
    get contentPreviewItem() {
      return contentPreviewItem
    },
    get preferImmediateContentRendering() {
      return preferImmediateContentRendering
    },
    get effectiveSourceFps() {
      return effectiveSourceFps
    },
  }
}
