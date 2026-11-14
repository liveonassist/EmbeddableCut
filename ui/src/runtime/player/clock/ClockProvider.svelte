<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { onDestroy, untrack, type Snippet } from 'svelte'
  import { createClock, type Clock, type ClockConfig } from '@/runtime/player/clock/Clock'
  import { ClockState, setClockContext } from './clock-hooks.svelte'

  interface ClockProviderProps {
    children: Snippet
    fps: number
    durationInFrames: number
    initialFrame?: number
    loop?: boolean
    onEnded?: () => void
    clock?: Clock
  }

  let {
    children,
    fps,
    durationInFrames,
    initialFrame = 0,
    loop = false,
    onEnded,
    clock: externalClock,
  }: ClockProviderProps = $props()

  // Created once, as React's ref-initialized clock: later prop changes are
  // synced onto it below rather than replacing it.
  const ownsClock = untrack(() => !externalClock)
  const clock = untrack(() => {
    if (externalClock) return externalClock
    const config: ClockConfig = {
      fps,
      durationInFrames,
      initialFrame,
      loop,
      onEnded,
    }
    return createClock(config)
  })

  const state = new ClockState(clock)
  setClockContext(state)

  $effect(() => {
    if (clock.fps !== fps) {
      clock.fps = fps
    }
  })

  $effect(() => {
    if (clock.durationInFrames !== durationInFrames) {
      clock.durationInFrames = durationInFrames
    }
  })

  $effect(() => {
    if (clock.loop !== loop) {
      clock.loop = loop
    }
  })

  onDestroy(() => {
    state.dispose()
    if (ownsClock) {
      clock.dispose()
    }
  })
</script>

{@render children()}
