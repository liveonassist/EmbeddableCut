// SPDX-License-Identifier: MIT

import {
  createScrubThrottleState,
  shouldCommitScrubFrame,
} from '@/features/editor/deps/timeline-utils'
import { usePlaybackStore } from '@/shared/state/playback'

type ScrubPointerEvent = PointerEvent & { currentTarget: EventTarget & HTMLDivElement }

export interface MiniTimelineScrubHandlers {
  onpointerdown: (event: ScrubPointerEvent) => void
  onpointermove: (event: ScrubPointerEvent) => void
  onpointerup: (event: ScrubPointerEvent) => void
  onpointercancel: (event: ScrubPointerEvent) => void
}

/**
 * Fast-scrub engine shared by the Color navigator and Animate strip. The
 * surface rect is captured once on pointer down (no per-move layout reads),
 * commits are rAF-batched and gated by the adaptive scrub throttle, and the
 * transient preview frame is updated during the drag without waking every
 * authoritative-current-frame consumer, and the exact pointer position is
 * committed on release. Spread the returned handlers onto the scrub surface.
 *
 * `options` is read on every event, so handlers always see the latest geometry.
 */
export function useMiniTimelineScrub(
  options: () => {
    maxFrame: number
    fps: number
    labelWidth: number
  },
): MiniTimelineScrubHandlers {
  let isScrubbing = false
  let scrubRect: DOMRect | null = null
  let scrubThrottle = createScrubThrottleState()
  let pendingClientX: number | null = null
  let scrubRaf: number | null = null

  const clientXToFrame = (clientX: number): number | null => {
    const rect = scrubRect
    if (!rect || rect.width <= 0) return null
    const { labelWidth, maxFrame } = options()
    const timelineWidth = Math.max(1, rect.width - labelWidth)
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - labelWidth) / timelineWidth))
    return Math.round(ratio * maxFrame)
  }

  const cancelScrubRaf = () => {
    if (scrubRaf !== null) {
      cancelAnimationFrame(scrubRaf)
      scrubRaf = null
    }
    pendingClientX = null
  }

  $effect(() => () => {
    cancelScrubRaf()
    if (isScrubbing) {
      usePlaybackStore.getState().setCompositionVisualFrozen(false)
    }
  })

  const runScrubLoop = () => {
    const clientX = pendingClientX
    const rect = scrubRect
    if (!isScrubbing || clientX === null || !rect) {
      scrubRaf = null
      return
    }
    const frame = clientXToFrame(clientX)
    if (frame !== null) {
      const { labelWidth, fps, maxFrame } = options()
      const timelineWidth = Math.max(1, rect.width - labelWidth)
      const safeFps = fps > 0 ? fps : 30
      const pixelsPerSecond = (timelineWidth * safeFps) / Math.max(1, maxFrame)
      const nowMs = performance.now()
      if (
        shouldCommitScrubFrame({
          state: scrubThrottle,
          pointerX: clientX - rect.left - labelWidth,
          targetFrame: frame,
          pixelsPerSecond,
          nowMs,
          overview: true,
        })
      ) {
        usePlaybackStore.getState().setPreviewFrame(frame, null)
      }
    }
    scrubRaf = requestAnimationFrame(runScrubLoop)
  }

  const onpointerdown = (event: ScrubPointerEvent) => {
    if (event.button !== 0) return
    isScrubbing = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    scrubRect = event.currentTarget.getBoundingClientRect()
    const frame = clientXToFrame(event.clientX)
    if (frame === null) return
    const playback = usePlaybackStore.getState()
    playback.pause()
    playback.setCompositionVisualFrozen(true)
    pendingClientX = event.clientX
    scrubThrottle = createScrubThrottleState({
      pointerX: event.clientX - scrubRect.left - options().labelWidth,
      frame,
      nowMs: performance.now(),
    })
    playback.setPreviewFrame(frame, null)
    if (scrubRaf === null) {
      scrubRaf = requestAnimationFrame(runScrubLoop)
    }
  }

  const onpointermove = (event: ScrubPointerEvent) => {
    if (!isScrubbing) return
    pendingClientX = event.clientX
  }

  const onpointerup = (event: ScrubPointerEvent) => {
    if (!isScrubbing) return
    cancelScrubRaf()
    const frame = clientXToFrame(event.clientX)
    const playback = usePlaybackStore.getState()
    if (frame !== null) playback.finishScrub(frame)
    isScrubbing = false
    scrubRect = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (frame === null) {
      playback.setPreviewFrame(null)
      playback.setCompositionVisualFrozen(false)
    }
  }

  const onpointercancel = (event: ScrubPointerEvent) => {
    if (!isScrubbing) return
    cancelScrubRaf()
    isScrubbing = false
    scrubRect = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const playback = usePlaybackStore.getState()
    playback.setPreviewFrame(null)
    playback.setCompositionVisualFrozen(false)
  }

  return { onpointerdown, onpointermove, onpointerup, onpointercancel }
}
