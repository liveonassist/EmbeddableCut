// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
import {
  useClipVisibility,
  type ClipVisibilityState,
} from '../../../hooks/use-clip-visibility.svelte'
import { useTimelineContentPixelsPerSecond } from '../../../contexts/timeline-zoom-context.svelte'
import { RENDER_BUFFER, type MediaTimelineItem } from './types'

export interface MediaClipGeometryOptions {
  clipLeftFrames: number
  clipWidthFrames: number
  fps: number
  preferImmediateRendering?: boolean
  minVisualWidthPx: number
}

export interface MediaClipGeometry {
  readonly clipWidth: number
  readonly renderWidth: number
  readonly pixelsPerSecond: number
  readonly showVisualContent: boolean
  readonly clipVisibility: ClipVisibilityState
}

export function useMediaClipGeometry(options: () => MediaClipGeometryOptions): MediaClipGeometry {
  const clipLeftFrames = $derived(options().clipLeftFrames)
  const clipWidthFrames = $derived(options().clipWidthFrames)
  const fps = $derived(options().fps)
  const preferImmediateRendering = $derived(options().preferImmediateRendering ?? false)
  const minVisualWidthPx = $derived(options().minVisualWidthPx)

  const pixelsPerSecond = useTimelineContentPixelsPerSecond(() => preferImmediateRendering)
  const clipLeftPx = $derived(fps > 0 ? (clipLeftFrames / fps) * pixelsPerSecond.current : 0)
  const clipWidth = $derived(
    Math.max(0, fps > 0 ? (clipWidthFrames / fps) * pixelsPerSecond.current : 0),
  )
  const clipVisibility = useClipVisibility(
    () => clipLeftPx,
    () => clipWidth,
    () => pixelsPerSecond.current,
  )

  return {
    get clipWidth() {
      return clipWidth
    },
    get renderWidth() {
      return Math.ceil(clipWidth * RENDER_BUFFER)
    },
    get pixelsPerSecond() {
      return pixelsPerSecond.current
    },
    get showVisualContent() {
      return clipWidth >= minVisualWidthPx
    },
    get clipVisibility() {
      return clipVisibility.current
    },
  }
}

export interface MediaSourceTiming {
  readonly sourceStart: number
  readonly sourceEnd: number | undefined
  readonly sourceDuration: number
  readonly trimStart: number
  readonly speed: number
  readonly isReversed: boolean
}

export function useMediaSourceTiming(
  item: () => MediaTimelineItem,
  fps: () => number,
): MediaSourceTiming {
  const sourceFps = $derived.by(() => {
    const mediaId = item().mediaId
    const fallbackFps = fps()
    return select(useMediaLibraryStore, (s) => {
      const media = s.mediaById[mediaId]
      return media?.fps || fallbackFps
    })
  })
  const mediaDuration = $derived.by(() => {
    const mediaId = item().mediaId
    return select(useMediaLibraryStore, (s) => s.mediaById[mediaId]?.duration || 0)
  })

  const timing = $derived.by(() => {
    const current = item()
    const duration = mediaDuration.current
    const fpsValue = sourceFps.current
    const sourceDurationFrames = Math.max(1, current.sourceDuration ?? current.durationInFrames)
    const sourceStartFrames = Math.max(0, current.sourceStart ?? 0)
    const sourceDuration = duration > 0 ? duration : sourceDurationFrames / fpsValue
    const sourceStart =
      duration > 0
        ? (sourceStartFrames / sourceDurationFrames) * duration
        : sourceStartFrames / fpsValue
    const sourceEndFrames = current.sourceEnd
    const sourceEnd =
      sourceEndFrames === undefined
        ? undefined
        : duration > 0
          ? (sourceEndFrames / sourceDurationFrames) * duration
          : sourceEndFrames / fpsValue

    return {
      sourceStart,
      sourceEnd,
      sourceDuration,
      trimStart: (current.trimStart ?? 0) / fps(),
      speed: current.speed ?? 1,
      isReversed: current.isReversed === true,
    }
  })

  return {
    get sourceStart() {
      return timing.sourceStart
    },
    get sourceEnd() {
      return timing.sourceEnd
    },
    get sourceDuration() {
      return timing.sourceDuration
    },
    get trimStart() {
      return timing.trimStart
    },
    get speed() {
      return timing.speed
    },
    get isReversed() {
      return timing.isReversed
    },
  }
}
