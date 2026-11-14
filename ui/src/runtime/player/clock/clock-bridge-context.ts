// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'

type SetStateAction<S> = S | ((previous: S) => S)

export interface SetTimelineContextValue {
  setFrame: (action: SetStateAction<Record<string, number>>) => void
  setPlaying: (action: SetStateAction<boolean>) => void
}

/** Reactive: `playing` and `playbackRate` are getters over the clock's state. */
export interface TimelinePlaybackContextValue {
  readonly playing: boolean
  readonly playbackRate: number
  imperativePlaying: { current: boolean }
  setPlaybackRate: (rate: number) => void
}

/** Reactive: `inFrame` and `outFrame` are getters over the provider's props. */
export interface TimelineBoundsContextValue {
  readonly rootId: string
  readonly inFrame: number | null
  readonly outFrame: number | null
}

const FRAME_KEY = Symbol('freecut.bridged-timeline-frame')
const PLAYBACK_KEY = Symbol('freecut.bridged-timeline-playback')
const BOUNDS_KEY = Symbol('freecut.bridged-timeline-bounds')
const SET_TIMELINE_KEY = Symbol('freecut.bridged-set-timeline')

export function setBridgedTimelineFrameContext(frame: { readonly current: number }): void {
  setContext(FRAME_KEY, frame)
}

export function setBridgedTimelinePlaybackContext(value: TimelinePlaybackContextValue): void {
  setContext(PLAYBACK_KEY, value)
}

export function setBridgedTimelineBoundsContext(value: TimelineBoundsContextValue): void {
  setContext(BOUNDS_KEY, value)
}

export function setBridgedSetTimelineContext(value: SetTimelineContextValue): void {
  setContext(SET_TIMELINE_KEY, value)
}

/**
 * Play transport state without the per-frame context. Components that only
 * need play/pause/rate (e.g. the Player shell and usePlayer) must use this
 * instead of reading the frame so a frame tick cannot re-run them.
 */
export function useBridgedTimelinePlayback(): TimelinePlaybackContextValue {
  const playback = getContext<TimelinePlaybackContextValue | undefined>(PLAYBACK_KEY)
  if (!playback) {
    throw new Error('useBridgedTimelinePlayback must be used within a ClockBridgeProvider')
  }
  return playback
}

export function useBridgedSetTimelineContext(): SetTimelineContextValue {
  const context = getContext<SetTimelineContextValue | undefined>(SET_TIMELINE_KEY)
  if (!context) {
    throw new Error('useBridgedSetTimelineContext must be used within a ClockBridgeProvider')
  }
  return context
}

export function useBridgedCurrentFrame(): { readonly current: number } {
  const frame = getContext<{ readonly current: number } | undefined>(FRAME_KEY)
  if (!frame) {
    throw new Error('useBridgedCurrentFrame must be used within a ClockBridgeProvider')
  }
  return frame
}

export function useBridgedIsPlaying(): { readonly current: boolean } {
  const playback = getContext<TimelinePlaybackContextValue | undefined>(PLAYBACK_KEY)
  if (!playback) {
    throw new Error('useBridgedIsPlaying must be used within a ClockBridgeProvider')
  }
  return {
    get current() {
      return playback.playing
    },
  }
}

function useBridgedTimelineBounds(name: string): TimelineBoundsContextValue {
  const bounds = getContext<TimelineBoundsContextValue | undefined>(BOUNDS_KEY)
  if (!bounds) {
    throw new Error(`${name} must be used within a ClockBridgeProvider`)
  }
  return bounds
}

export function useBridgedSetTimelineFrame(): (frame: number) => void {
  const { setFrame } = useBridgedSetTimelineContext()
  const bounds = useBridgedTimelineBounds('useBridgedSetTimelineFrame')

  return (newFrame: number) => {
    const { inFrame, outFrame } = bounds
    let clampedFrame = newFrame
    if (inFrame !== null && clampedFrame < inFrame) {
      clampedFrame = inFrame
    }
    if (outFrame !== null && clampedFrame > outFrame) {
      clampedFrame = outFrame
    }

    setFrame((c) => ({
      ...c,
      'player-comp': clampedFrame,
    }))
  }
}

export function useBridgedActualFirstFrame(): { readonly current: number } {
  const bounds = useBridgedTimelineBounds('useBridgedActualFirstFrame')
  return {
    get current() {
      return bounds.inFrame ?? 0
    },
  }
}

export function useBridgedActualLastFrame(durationInFrames: () => number): {
  readonly current: number
} {
  const bounds = useBridgedTimelineBounds('useBridgedActualLastFrame')
  return {
    get current() {
      return bounds.outFrame ?? durationInFrames() - 1
    },
  }
}
