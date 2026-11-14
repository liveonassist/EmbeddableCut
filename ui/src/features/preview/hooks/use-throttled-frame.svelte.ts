// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'

import { usePlaybackStore } from '@/shared/state/playback'

interface UseThrottledFrameOptions {
  /**
   * If true, updates during playback at throttled rate.
   * If false (default), only updates when paused/scrubbing.
   */
  updateDuringPlayback?: boolean
  /**
   * If true (default), paused scrub preview frames update subscribers live.
   * Heavy inspectors can set this false and catch up when the scrub releases.
   */
  updateDuringScrub?: boolean
  /** Update rate in ms when updateDuringPlayback is true. Default 100ms (10fps). */
  throttleMs?: number
}

/**
 * Returns currentFrame that only updates when paused (default).
 *
 * Updates when:
 * - Playback stops (immediately syncs to current frame)
 * - User scrubs while paused (immediate updates)
 * - Component mounts
 *
 * Does NOT update during playback by default (set updateDuringPlayback: true to enable).
 */
export function useThrottledFrame(options: () => UseThrottledFrameOptions = () => ({})): {
  readonly current: number
} {
  const {
    updateDuringPlayback = false,
    updateDuringScrub = true,
    throttleMs = 100,
  } = $derived(options())

  // Local state that triggers re-renders
  let frame = $state.raw(usePlaybackStore.getState().currentFrame)
  const setFrame = (next: typeof frame | ((prev: typeof frame) => typeof frame)) => {
    frame =
      typeof next === 'function'
        ? (next as (prev: typeof frame) => typeof frame)(untrack(() => frame))
        : next
  }

  // Refs for tracking state without re-renders
  const lastUpdateTimeRef = { current: 0 }
  $effect(() => {
    let wasPlaying = usePlaybackStore.getState().isPlaying

    const unsubscribe = usePlaybackStore.subscribe((state, previousState) => {
      const isPlaying = state.isPlaying
      const currentFrame = state.currentFrame

      // Always update when playback stops (sync to final frame)
      if (wasPlaying && !isPlaying) {
        setFrame(currentFrame)
        wasPlaying = isPlaying
        return
      }

      wasPlaying = isPlaying

      // When paused, update immediately (scrubbing)
      if (!isPlaying) {
        if (!updateDuringScrub && state.previewFrame !== null) {
          return
        }
        setFrame(currentFrame)
        if (!updateDuringScrub && previousState.previewFrame !== null) {
          lastUpdateTimeRef.current = performance.now()
        }
        return
      }

      // During playback - skip updates unless explicitly enabled
      if (!updateDuringPlayback) {
        return
      }

      // Throttled updates during playback
      const now = performance.now()
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current

      if (timeSinceLastUpdate >= throttleMs) {
        setFrame(currentFrame)
        lastUpdateTimeRef.current = now
      }
    })

    return () => {
      unsubscribe()
    }
  })

  return {
    get current() {
      return frame
    },
  }
}
