// SPDX-License-Identifier: MIT

import { formatSignedFrameDelta, formatTimecodeCompact } from '@/shared/utils/time-utils'
import { pixelsToFrameNow } from '@/features/timeline/utils/zoom-conversions'

export interface ClipTrimInfoLabel {
  delta: string
  duration: string
  side: 'start' | 'end'
}

export interface ClipReadoutLabelsInput {
  fps: number
  isTrimming: boolean
  trimHandle: 'start' | 'end' | null
  trimDelta: number
  visualWidthFrames: number
  isDragging: boolean
  dragOffsetX: number
}

export interface ClipReadoutLabels {
  /** Delta + resulting duration shown above the dragged trim edge, or null when idle. */
  readonly trimInfoLabel: ClipTrimInfoLabel | null
  /** Signed frame delta shown while moving a clip, or null when idle / no movement. */
  readonly moveInfoLabel: string | null
}

/**
 * Floating readout labels for a clip during trim and move gestures.
 */
export function useClipReadoutLabels(input: () => ClipReadoutLabelsInput): ClipReadoutLabels {
  const fps = $derived(input().fps)
  const isTrimming = $derived(input().isTrimming)
  const trimHandle = $derived(input().trimHandle)
  const trimDelta = $derived(input().trimDelta)
  const visualWidthFrames = $derived(input().visualWidthFrames)
  const isDragging = $derived(input().isDragging)
  const dragOffsetX = $derived(input().dragOffsetX)

  const trimInfoLabel = $derived.by<ClipTrimInfoLabel | null>(() => {
    if (!isTrimming || !trimHandle) return null

    const durationDelta = trimHandle === 'start' ? -trimDelta : trimDelta
    return {
      delta: formatSignedFrameDelta(durationDelta, fps),
      duration: formatTimecodeCompact(Math.round(visualWidthFrames), fps),
      side: trimHandle,
    }
  })

  const moveInfoLabel = $derived.by(() => {
    if (!isDragging) return null

    const frameDelta = pixelsToFrameNow(dragOffsetX)
    if (frameDelta === 0) return null

    return formatSignedFrameDelta(frameDelta, fps)
  })

  return {
    get trimInfoLabel() {
      return trimInfoLabel
    },
    get moveInfoLabel() {
      return moveInfoLabel
    },
  }
}
