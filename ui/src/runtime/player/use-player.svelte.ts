// SPDX-License-Identifier: MIT

/**
 * Core playback hook for the FreeCut Player
 *
 * Provides all playback operations including:
 * - play/pause/toggle
 * - Frame-based seeking
 * - Frame navigation (forward/back)
 * - Current frame queries
 * - Event emission
 */

import { type PlayerEmitter, usePlayerEmitter } from './event-emitter'
import {
  useBridgedTimelinePlayback,
  useBridgedSetTimelineContext,
  useBridgedSetTimelineFrame,
  useBridgedActualLastFrame,
  useBridgedActualFirstFrame,
  useClock,
} from './clock'

/** `playing`, `hasPlayed`, `isLastFrame` and `isFirstFrame` are reactive getters. */
interface UsePlayerMethods {
  frameBack: (frames: number) => void
  frameForward: (frames: number) => void
  readonly isLastFrame: boolean
  readonly isFirstFrame: boolean
  emitter: PlayerEmitter
  readonly playing: boolean
  play: () => void
  pause: () => void
  pauseAndReturnToPlayStart: () => void
  seek: (newFrame: number) => void
  getCurrentFrame: () => number
  isPlaying: () => boolean
  readonly hasPlayed: boolean
  isBuffering: () => boolean
  toggle: () => void
  setPlaybackRate: (rate: number) => void
  getPlaybackRate: () => number
}

/**
 * Core playback logic for the player.
 *
 * @returns Object containing all playback methods and state
 */
export function usePlayer(
  durationInFrames: () => number,
  // loop and onEnded are reserved for future use in the playback loop
  _options: () => { loop?: boolean; onEnded?: () => void } = () => ({}),
): UsePlayerMethods {
  // The frame is intentionally NOT read from context here: doing so would
  // re-run every usePlayer caller on each frame.
  const playback = useBridgedTimelinePlayback()
  const { imperativePlaying } = playback
  const { setPlaying } = useBridgedSetTimelineContext()
  const setTimelineFrame = useBridgedSetTimelineFrame()
  const emitter = usePlayerEmitter()
  const clock = useClock()

  // Track if user has played at least once
  let hasPlayed = $state(false)

  // Tracking state without causing re-runs
  const playStart = { current: 0 }
  const frameRef = { current: clock.currentFrame }
  const bufferingRef = { current: false }

  // Keep the imperative frame synced from clock events. The clock emits
  // 'framechange' for both ticks and seeks (see Clock.seekToFrame).
  $effect(() => {
    frameRef.current = clock.currentFrame
    return clock.onFrameChange((frame) => {
      frameRef.current = frame
    })
  })

  // Calculate boundaries
  const lastFrame = useBridgedActualLastFrame(durationInFrames)
  const firstFrame = useBridgedActualFirstFrame()

  /**
   * Seek to a specific frame
   */
  const seek = (newFrame: number) => {
    const first = firstFrame.current
    const last = lastFrame.current
    // Clamp to valid range
    let clampedFrame = Math.max(first, Math.min(newFrame, last))

    // Apply in/out frame bounds
    if (clampedFrame < first) clampedFrame = first
    if (clampedFrame > last) clampedFrame = last

    frameRef.current = clampedFrame
    setTimelineFrame(clampedFrame)
    emitter.dispatchSeek(clampedFrame)
  }

  /**
   * Play the video
   */
  const play = () => {
    if (imperativePlaying.current) {
      return
    }

    hasPlayed = true

    // If at the last frame, restart from beginning
    if (frameRef.current >= lastFrame.current) {
      seek(firstFrame.current)
    }

    imperativePlaying.current = true
    setPlaying(true)
    emitter.dispatchPlay()
  }

  /**
   * Pause the video
   */
  const pause = () => {
    if (imperativePlaying.current) {
      imperativePlaying.current = false
      setPlaying(false)
      emitter.dispatchPause()
    }
  }

  /**
   * Pause and return to where playback started
   */
  const pauseAndReturnToPlayStart = () => {
    if (imperativePlaying.current) {
      imperativePlaying.current = false
      frameRef.current = playStart.current
      setTimelineFrame(playStart.current)
      setPlaying(false)
      emitter.dispatchPause()
    }
  }

  /**
   * Toggle play/pause state
   */
  const toggle = () => {
    if (imperativePlaying.current) {
      pause()
    } else {
      play()
    }
  }

  /**
   * Move back by a number of frames
   */
  const frameBack = (frames: number) => {
    if (imperativePlaying.current) {
      return
    }

    const prevFrame = frameRef.current
    const newFrame = Math.max(firstFrame.current, prevFrame - frames)

    if (prevFrame !== newFrame) {
      seek(newFrame)
    }
  }

  /**
   * Move forward by a number of frames
   */
  const frameForward = (frames: number) => {
    if (imperativePlaying.current) {
      return
    }

    const prevFrame = frameRef.current
    const newFrame = Math.min(lastFrame.current, prevFrame + frames)

    if (prevFrame !== newFrame) {
      seek(newFrame)
    }
  }

  return {
    frameBack,
    frameForward,
    get isLastFrame() {
      return frameRef.current === lastFrame.current
    },
    get isFirstFrame() {
      return frameRef.current === firstFrame.current
    },
    emitter,
    get playing() {
      return playback.playing
    },
    play,
    pause,
    pauseAndReturnToPlayStart,
    seek,
    getCurrentFrame: () => frameRef.current,
    isPlaying: () => imperativePlaying.current,
    get hasPlayed() {
      return hasPlayed
    },
    isBuffering: () => bufferingRef.current,
    toggle,
    setPlaybackRate: (rate: number) => {
      playback.setPlaybackRate(rate)
      emitter.dispatchRateChange(rate)
    },
    getPlaybackRate: () => playback.playbackRate,
  }
}
