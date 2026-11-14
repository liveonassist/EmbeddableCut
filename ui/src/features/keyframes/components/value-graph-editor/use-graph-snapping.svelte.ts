// SPDX-License-Identifier: MIT

/**
 * Graph snapping hook.
 * Provides snap-to-target math, pixel-to-graph-unit threshold conversion,
 * and clamping logic to keep dragged keyframes out of transition-blocked
 * frame ranges. Pure functions of viewport dimensions and the input
 * snap/block configuration — no internal state.
 */

import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'
import { SNAP_THRESHOLD_PX } from './graph-interaction-types'

interface GraphDimensionsSlice {
  graphWidth: number
  graphHeight: number
  frameRange: number
  valueRange: number
}

export interface UseGraphSnappingOptions {
  snapEnabled: boolean
  graphDimensions: GraphDimensionsSlice
  blockedFrameRanges: BlockedFrameRange[]
}

export interface UseGraphSnappingReturn {
  snapToTargets: (
    value: number,
    targets: number[],
    thresholdInUnits: number,
  ) => { snapped: number; didSnap: boolean }
  readonly snapThresholds: { frameThreshold: number; valueThreshold: number }
  clampToAvoidBlockedRanges: (frame: number, initialFrame: number) => number
}

export function useGraphSnapping(options: () => UseGraphSnappingOptions): UseGraphSnappingReturn {
  const snapToTargets = (
    value: number,
    targets: number[],
    thresholdInUnits: number,
  ): { snapped: number; didSnap: boolean } => {
    if (!options().snapEnabled || targets.length === 0) {
      return { snapped: value, didSnap: false }
    }

    let closestTarget = value
    let closestDistance = Infinity

    for (const target of targets) {
      const distance = Math.abs(value - target)
      if (distance < closestDistance && distance <= thresholdInUnits) {
        closestDistance = distance
        closestTarget = target
      }
    }

    return {
      snapped: closestDistance <= thresholdInUnits ? closestTarget : value,
      didSnap: closestDistance <= thresholdInUnits,
    }
  }

  const graphDimensions = $derived(options().graphDimensions)
  const snapThresholds = $derived.by(() => {
    const { graphWidth, graphHeight, frameRange, valueRange } = graphDimensions
    const frameThreshold = (SNAP_THRESHOLD_PX / graphWidth) * frameRange
    const valueThreshold = (SNAP_THRESHOLD_PX / graphHeight) * valueRange
    return { frameThreshold, valueThreshold }
  })

  const clampToAvoidBlockedRanges = (frame: number, initialFrame: number): number => {
    const { blockedFrameRanges } = options()
    if (blockedFrameRanges.length === 0) return frame

    for (const range of blockedFrameRanges) {
      if (frame >= range.start && frame < range.end) {
        if (initialFrame < range.start) {
          // Coming from the left, clamp to left edge
          return range.start - 1
        } else if (initialFrame >= range.end) {
          // Coming from the right, clamp to right edge
          return range.end
        } else {
          // Started inside the blocked range — clamp to nearest edge
          const distToStart = frame - range.start
          const distToEnd = range.end - frame
          return distToStart < distToEnd ? range.start - 1 : range.end
        }
      }
    }
    return frame
  }

  return {
    snapToTargets,
    get snapThresholds() {
      return snapThresholds
    },
    clampToAvoidBlockedRanges,
  }
}
