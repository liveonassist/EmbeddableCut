// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { select, shallow } from '$lib/store.svelte'
import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
import { useZoomStore } from '@/features/timeline/stores/zoom-store'

/**
 * Pixels of margin beyond the viewport for considering a clip "visible".
 * Increased from 200 to 600 to absorb the 50ms viewport store throttle —
 * at fast scroll speeds (~200px/frame × 3 frames), tiles stay pre-rendered
 * 600px ahead, preventing blank flashes at the leading edge.
 */
export const CLIP_VISIBILITY_PREFETCH_MARGIN_PX = 600
const RATIO_EPSILON = 0.002
const getStandaloneZoomSnapshot = () => {
  const state = useZoomStore.getState()
  return state.isZoomInteracting ? Number.NaN : state.contentPixelsPerSecond
}

export interface ClipVisibilityState {
  isVisible: boolean
  visibleStartRatio: number
  visibleEndRatio: number
}

/**
 * Hook to detect when a timeline clip is visible in the shared timeline viewport.
 * Uses clip geometry in timeline-content coordinates (left/width) and avoids
 * per-clip scroll listeners/observers.
 *
 * During zoom interaction, clip positions and the viewport temporarily use
 * different coordinate spaces. Keep the last valid bounded window until zoom
 * settles instead of expanding every clip to its full duration.
 */
export function useClipVisibility(
  clipLeftPx: () => number,
  clipWidthPx: () => number,
  geometryPixelsPerSecond: () => number | undefined = () => undefined,
): { readonly current: ClipVisibilityState } {
  const committedVisibilityRef = {
    current: computeVisibility(
      useTimelineViewportStore.getState(),
      untrack(clipLeftPx),
      untrack(clipWidthPx),
    ),
  } as { current: ClipVisibilityState }

  // Standalone consumers that do not provide their geometry scale retain a
  // small settled-zoom subscription. Main-timeline clip content passes the
  // bridged scale, so this subscription is never read there and cannot fan
  // out on zoom end.
  const standaloneZoom = select(useZoomStore, getStandaloneZoomSnapshot)

  const visibilitySource = $derived.by(() => {
    const left = clipLeftPx()
    const width = clipWidthPx()
    const geometryScale = geometryPixelsPerSecond()
    if (geometryScale === undefined) void standaloneZoom.current

    return select(
      useTimelineViewportStore,
      (viewport) => {
        const zoom = useZoomStore.getState()
        const bridgedGeometryIsCurrent =
          geometryScale === undefined ||
          Math.abs(geometryScale - zoom.contentPixelsPerSecond) < 0.001

        // Live scrollLeft and settled clip pixels use different coordinate
        // spaces. Also remain frozen while the provider's settled geometry
        // hasn't caught up with the store yet.
        if (zoom.isZoomInteracting || !bridgedGeometryIsCurrent) {
          return committedVisibilityRef.current
        }

        const next = computeVisibility(viewport, left, width)
        const previous = committedVisibilityRef.current
        if (
          previous.isVisible === next.isVisible &&
          Math.abs(previous.visibleStartRatio - next.visibleStartRatio) < RATIO_EPSILON &&
          Math.abs(previous.visibleEndRatio - next.visibleEndRatio) < RATIO_EPSILON
        ) {
          return previous
        }

        return next
      },
      shallow,
    )
  })

  // Publish the frozen baseline once the selected visibility is in use.
  $effect.pre(() => {
    committedVisibilityRef.current = visibilitySource.current
  })

  return {
    get current() {
      return visibilitySource.current
    },
  }
}

interface TimelineViewportSnapshot {
  scrollLeft: number
  scrollTop: number
  viewportWidth: number
  viewportHeight: number
}

function computeVisibility(
  viewport: TimelineViewportSnapshot,
  clipLeftPx: number,
  clipWidthPx: number,
  prefetchMarginPx = CLIP_VISIBILITY_PREFETCH_MARGIN_PX,
): ClipVisibilityState {
  if (clipWidthPx <= 0 || viewport.viewportWidth <= 0) {
    return {
      isVisible: false,
      visibleStartRatio: 0,
      visibleEndRatio: 1,
    }
  }

  const viewLeft = viewport.scrollLeft - prefetchMarginPx
  const viewRight = viewport.scrollLeft + viewport.viewportWidth + prefetchMarginPx
  const clipRightPx = clipLeftPx + clipWidthPx

  const overlapLeft = Math.max(clipLeftPx, viewLeft)
  const overlapRight = Math.min(clipRightPx, viewRight)
  const isVisible = overlapRight > overlapLeft

  if (!isVisible) {
    return {
      isVisible: false,
      visibleStartRatio: 0,
      visibleEndRatio: 1,
    }
  }

  const startRatio = Math.max(0, Math.min(1, (overlapLeft - clipLeftPx) / clipWidthPx))
  const endRatio = Math.max(startRatio, Math.min(1, (overlapRight - clipLeftPx) / clipWidthPx))

  return {
    isVisible: true,
    visibleStartRatio: startRatio,
    visibleEndRatio: endRatio,
  }
}
