// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { useTimelineViewportStore } from '@/features/timeline/stores/timeline-viewport-store'
import { useZoomStore } from '@/features/timeline/stores/zoom-store'

export const EDIT_DOPESHEET_PAN_SETTLE_MS = 90
export const EDIT_DOPESHEET_PAN_REBASE_VIEWPORT_RATIO = 0.75

export interface SettledTimelineGeometry {
  scrollLeft: number
  pixelsPerSecond: number
}

/**
 * Publishes the expensive Edit dopesheet's zoom and scroll geometry as one
 * snapshot. Wheel zoom updates both values in the same animation frame, but
 * their separate settled subscriptions can otherwise briefly pair a new zoom
 * with the previous scroll anchor and move every ruler tick offscreen.
 */
export function useSettledTimelineGeometry(
  scrollContainer: () => HTMLDivElement | null | undefined,
  enabled: () => boolean,
  contentPixelsPerSecond: () => number,
): { readonly scrollLeft: number; readonly pixelsPerSecond: number } {
  const initialGeometry = untrack(() => ({
    scrollLeft: scrollContainer()?.scrollLeft ?? useTimelineViewportStore.getState().scrollLeft,
    pixelsPerSecond: contentPixelsPerSecond(),
  }))
  let geometry = $state.raw<SettledTimelineGeometry>(initialGeometry)
  let publishedGeometry = initialGeometry

  $effect.pre(() => {
    void contentPixelsPerSecond()
    const isEnabled = enabled()
    const container = scrollContainer()
    return untrack(() => {
      if (!isEnabled) return
      if (!container) return

      let settleTimeout: ReturnType<typeof setTimeout> | null = null
      let publishFrame: number | null = null

      const publish = () => {
        publishFrame = null
        const zoomState = useZoomStore.getState()
        // Keep the previous coherent snapshot while the compositor handles the
        // live gesture. The content zoom commit below will schedule one publish.
        if (zoomState.isZoomInteracting) return

        const nextGeometry = {
          scrollLeft: container.scrollLeft,
          pixelsPerSecond: zoomState.contentPixelsPerSecond,
        }
        const previousGeometry = publishedGeometry
        if (
          Math.abs(nextGeometry.scrollLeft - previousGeometry.scrollLeft) < 0.5 &&
          Math.abs(nextGeometry.pixelsPerSecond - previousGeometry.pixelsPerSecond) < 0.001
        ) {
          return
        }

        publishedGeometry = nextGeometry
        geometry = nextGeometry
      }

      const schedulePublishFrame = () => {
        if (publishFrame !== null) cancelAnimationFrame(publishFrame)
        publishFrame = requestAnimationFrame(publish)
      }

      const handleScroll = () => {
        const viewportWidth = container.clientWidth
        const rebaseDistance = viewportWidth * EDIT_DOPESHEET_PAN_REBASE_VIEWPORT_RATIO
        if (
          !useZoomStore.getState().isZoomInteracting &&
          viewportWidth > 0 &&
          Math.abs(container.scrollLeft - publishedGeometry.scrollLeft) >= rebaseDistance
        ) {
          publish()
        }
        if (settleTimeout !== null) clearTimeout(settleTimeout)
        settleTimeout = setTimeout(publish, EDIT_DOPESHEET_PAN_SETTLE_MS)
      }

      // A synchronized zoom updates the store before its anchor scrollLeft is
      // assigned. Waiting for the next frame lets us read both final values
      // together, while the old surface remains correctly transformed meanwhile.
      schedulePublishFrame()
      container.addEventListener('scroll', handleScroll, { passive: true })
      const unsubscribeZoom = useZoomStore.subscribe((state, previousState) => {
        if (previousState.isZoomInteracting && !state.isZoomInteracting) {
          schedulePublishFrame()
        }
      })
      return () => {
        container.removeEventListener('scroll', handleScroll)
        unsubscribeZoom()
        if (settleTimeout !== null) clearTimeout(settleTimeout)
        if (publishFrame !== null) cancelAnimationFrame(publishFrame)
      }
    })
  })

  return {
    get scrollLeft() {
      return geometry.scrollLeft
    },
    get pixelsPerSecond() {
      return geometry.pixelsPerSecond
    },
  }
}

/**
 * Keeps expensive keyframe geometry off the main timeline's per-frame pan path.
 * The dopesheet translates its already-rendered geometry from live scrollLeft;
 * this value only refreshes the geometry occasionally and after settling.
 */
export function useSettledTimelineScrollLeft(
  scrollContainer: () => HTMLDivElement | null | undefined,
  enabled: () => boolean,
): { readonly current: number } {
  const initialScrollLeft = useTimelineViewportStore.getState().scrollLeft
  let scrollLeft = $state(initialScrollLeft)
  let publishedScrollLeft = initialScrollLeft

  $effect.pre(() => {
    const isEnabled = enabled()
    const container = scrollContainer()
    return untrack(() => {
      if (!isEnabled) return
      if (!container) return

      let settleTimeout: ReturnType<typeof setTimeout> | null = null
      const publish = () => {
        if (settleTimeout !== null) {
          clearTimeout(settleTimeout)
          settleTimeout = null
        }
        const nextScrollLeft = container.scrollLeft
        if (Math.abs(nextScrollLeft - publishedScrollLeft) < 0.5) return
        publishedScrollLeft = nextScrollLeft
        scrollLeft = nextScrollLeft
      }

      const handleScroll = () => {
        const viewportWidth = container.clientWidth
        const rebaseDistance = viewportWidth * EDIT_DOPESHEET_PAN_REBASE_VIEWPORT_RATIO
        if (
          viewportWidth > 0 &&
          Math.abs(container.scrollLeft - publishedScrollLeft) >= rebaseDistance
        ) {
          publish()
        }
        if (settleTimeout !== null) clearTimeout(settleTimeout)
        settleTimeout = setTimeout(publish, EDIT_DOPESHEET_PAN_SETTLE_MS)
      }

      // The DOM is authoritative and may be ahead of the throttled viewport store
      // when the panel opens in the middle of a momentum gesture.
      publish()
      container.addEventListener('scroll', handleScroll, { passive: true })
      return () => {
        container.removeEventListener('scroll', handleScroll)
        if (settleTimeout !== null) clearTimeout(settleTimeout)
      }
    })
  })

  return {
    get current() {
      return scrollLeft
    },
  }
}
