<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { Clock } from '@/runtime/player/clock/Clock'
  import { useClock } from './ClockContext'
  import {
    useBridgedCurrentFrame,
    useBridgedIsPlaying,
    useBridgedTimelinePlayback,
  } from './clock-bridge-context'

  // Test probe: reports the clock, and each bridged value every time its reader re-runs.
  let {
    onClock,
    onPlaying,
    onPlayback,
    onFrame,
  }: {
    onClock: (clock: Clock) => void
    onPlaying: (playing: boolean) => void
    onPlayback: (playing: boolean) => void
    onFrame: (frame: number) => void
  } = $props()

  const clock = useClock()
  untrack(() => onClock(clock))
  const playing = useBridgedIsPlaying()
  const playback = useBridgedTimelinePlayback()
  const frame = useBridgedCurrentFrame()

  $effect.pre(() => onPlaying(playing.current))
  $effect.pre(() => onPlayback(playback.playing))
  $effect.pre(() => onFrame(frame.current))
</script>
