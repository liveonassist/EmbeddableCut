// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'
import type { Clock } from '@/runtime/player/clock/Clock'

/**
 * A Clock's transport state as runes, shared by every reader under one
 * ClockProvider: one set of clock listeners however many components read the
 * frame, and readers re-run only when a value actually changes.
 */
export class ClockState {
  readonly clock: Clock
  frame = $state(0)
  isPlaying = $state(false)
  playbackRate = $state(1)
  private readonly unsubscribe: () => void

  constructor(clock: Clock) {
    this.clock = clock
    this.frame = clock.currentFrame
    this.isPlaying = clock.isPlaying
    this.playbackRate = clock.playbackRate

    const syncFrame = () => {
      this.frame = clock.currentFrame
    }
    const syncPlaying = () => {
      this.isPlaying = clock.isPlaying
    }
    const syncRate = () => {
      this.playbackRate = clock.playbackRate
    }
    clock.addEventListener('framechange', syncFrame)
    clock.addEventListener('seek', syncFrame)
    clock.addEventListener('play', syncPlaying)
    clock.addEventListener('pause', syncPlaying)
    clock.addEventListener('ended', syncPlaying)
    clock.addEventListener('ratechange', syncRate)
    this.unsubscribe = () => {
      clock.removeEventListener('framechange', syncFrame)
      clock.removeEventListener('seek', syncFrame)
      clock.removeEventListener('play', syncPlaying)
      clock.removeEventListener('pause', syncPlaying)
      clock.removeEventListener('ended', syncPlaying)
      clock.removeEventListener('ratechange', syncRate)
    }
  }

  dispose(): void {
    this.unsubscribe()
  }
}

const CLOCK_KEY = Symbol('embeddablecut.clock')

export function setClockContext(state: ClockState): void {
  setContext(CLOCK_KEY, state)
}

function useClockState(name: string): ClockState {
  const state = getContext<ClockState | undefined>(CLOCK_KEY)
  if (!state) {
    throw new Error(`${name} must be used within a ClockProvider`)
  }
  return state
}

export function useClock(): Clock {
  return useClockState('useClock').clock
}

export function useClockFrame(): { readonly current: number } {
  const state = useClockState('useClockFrame')
  return {
    get current() {
      return state.frame
    },
  }
}

/**
 * Subscribe to a derived Clock frame value.
 *
 * The selected value is compared with `===` before readers re-run. This lets
 * range-based consumers keep a stable value while the playhead is outside
 * their active range instead of re-running for every unrelated framechange.
 * The selector may read reactive props; it re-evaluates when they change.
 */
export function useClockFrameSelector<T>(selector: (frame: number) => T): {
  readonly current: T
} {
  const state = useClockState('useClockFrameSelector')
  const selected = $derived(selector(state.frame))
  return {
    get current() {
      return selected
    },
  }
}

export function useClockIsPlaying(): { readonly current: boolean } {
  const state = useClockState('useClockIsPlaying')
  return {
    get current() {
      return state.isPlaying
    },
  }
}

export function useClockPlaybackRate(): { readonly current: number } {
  const state = useClockState('useClockPlaybackRate')
  return {
    get current() {
      return state.playbackRate
    },
  }
}
