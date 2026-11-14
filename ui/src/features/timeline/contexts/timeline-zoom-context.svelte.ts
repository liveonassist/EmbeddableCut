// SPDX-License-Identifier: MIT

/**
 * Timeline Zoom Utilities
 *
 * Provides zoom-related values and helper functions for timeline components.
 */

import { getContext, setContext } from 'svelte'
import { select } from '$lib/store.svelte'
import { useSettledZoomStore, useZoomStore } from '@/features/timeline/stores/zoom-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'

const SETTLED_CONTENT_PIXELS_PER_SECOND = Symbol('timeline.settled-content-pixels-per-second')

/** What `TimelineSettledContentZoomProvider` publishes: the settled pixels-per-second, read reactively. */
export interface SettledContentPixelsPerSecond {
  readonly current: number
}

export function setSettledContentPixelsPerSecondContext(value: SettledContentPixelsPerSecond) {
  setContext(SETTLED_CONTENT_PIXELS_PER_SECOND, value)
}

/**
 * Reads settled content geometry through the bridge when mounted in the main
 * timeline. Standalone consumers (including focused tests) retain the direct
 * store fallback. Active edit previews deliberately bypass the bridge and stay
 * on the live zoom value.
 */
export function useTimelineContentPixelsPerSecond(
  preferImmediateRendering: () => boolean = () => false,
): { readonly current: number } {
  const bridged = getContext<SettledContentPixelsPerSecond | undefined>(
    SETTLED_CONTENT_PIXELS_PER_SECOND,
  )
  const live = select(useZoomStore, (s) => s.pixelsPerSecond)
  const settled = select(useSettledZoomStore, (s) => s.contentPixelsPerSecond)

  return {
    get current() {
      if (preferImmediateRendering()) return live.current
      if (bridged) return bridged.current
      return settled.current ?? 0
    },
  }
}

export interface TimelineZoomValue {
  readonly zoomLevel: number
  readonly pixelsPerSecond: number
  readonly fps: number
  timeToPixels: (timeInSeconds: number) => number
  pixelsToTime: (pixels: number) => number
  frameToPixels: (frame: number) => number
  pixelsToFrame: (pixels: number) => number
}

function createTimelineZoomValue(
  zoomLevelSource: { readonly current: number },
  pixelsPerSecondSource: { readonly current: number },
): TimelineZoomValue {
  const fpsSource = select(useTimelineSettingsStore, (s) => s.fps)

  return {
    get zoomLevel() {
      return zoomLevelSource.current
    },
    get pixelsPerSecond() {
      return pixelsPerSecondSource.current
    },
    get fps() {
      return fpsSource.current
    },
    timeToPixels: (t: number) => t * pixelsPerSecondSource.current,
    pixelsToTime: (p: number) => {
      const pixelsPerSecond = pixelsPerSecondSource.current
      return pixelsPerSecond > 0 ? p / pixelsPerSecond : 0
    },
    frameToPixels: (f: number) => (f / fpsSource.current) * pixelsPerSecondSource.current,
    pixelsToFrame: (p: number) =>
      Math.round((p / pixelsPerSecondSource.current) * fpsSource.current),
  }
}

/**
 * Hook to get timeline zoom values and helper functions.
 *
 * Reads directly from the zoom stores. Values are getters: read them where
 * they're used, never destructure them.
 */
export function useTimelineZoomContext(): TimelineZoomValue {
  return createTimelineZoomValue(
    select(useZoomStore, (s) => s.level),
    select(useZoomStore, (s) => s.pixelsPerSecond),
  )
}

/** Settled geometry hook for expensive clip and waveform content. */
export function useTimelineCommittedZoomContext(): TimelineZoomValue {
  return createTimelineZoomValue(
    select(useSettledZoomStore, (state) => state.contentLevel),
    select(useSettledZoomStore, (state) => state.contentPixelsPerSecond),
  )
}
