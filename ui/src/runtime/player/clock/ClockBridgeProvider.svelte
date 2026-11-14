<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { createClock } from '@/runtime/player/clock/Clock'
  import { ClockProvider } from './ClockContext'
  import ClockBridgeInner from './ClockBridgeInner.svelte'

  interface ClockBridgeProviderProps {
    children: Snippet
    fps: number
    durationInFrames: number
    initialFrame?: number
    initiallyMuted?: boolean
    inFrame?: number | null
    outFrame?: number | null
    initialPlaybackRate?: number
    loop?: boolean
    onEnded?: () => void
    onVolumeChange?: (volume: number, isMuted: boolean) => void
  }

  let {
    children,
    fps,
    durationInFrames,
    initialFrame = 0,
    initialPlaybackRate = 1,
    loop = false,
    inFrame = null,
    outFrame = null,
    onEnded,
  }: ClockBridgeProviderProps = $props()

  const clock = untrack(() => {
    const created = createClock({
      fps,
      durationInFrames,
      initialFrame,
      loop,
      onEnded,
    })
    if (initialPlaybackRate !== 1) {
      created.playbackRate = initialPlaybackRate
    }
    return created
  })
</script>

<ClockProvider {fps} {durationInFrames} {initialFrame} {loop} {onEnded} {clock}>
  <ClockBridgeInner {inFrame} {outFrame}>
    {@render children()}
  </ClockBridgeInner>
</ClockProvider>
