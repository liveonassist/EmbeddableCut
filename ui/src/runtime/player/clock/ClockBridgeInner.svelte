<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { useClock, useClockFrame, useClockIsPlaying, useClockPlaybackRate } from './ClockContext'
  import {
    setBridgedSetTimelineContext,
    setBridgedTimelineBoundsContext,
    setBridgedTimelineFrameContext,
    setBridgedTimelinePlaybackContext,
    type SetTimelineContextValue,
  } from './clock-bridge-context'

  let {
    children,
    inFrame,
    outFrame,
  }: {
    children: Snippet
    inFrame: number | null
    outFrame: number | null
  } = $props()

  const clock = useClock()
  const frame = useClockFrame()
  const playing = useClockIsPlaying()
  const playbackRate = useClockPlaybackRate()

  const imperativePlaying = { current: untrack(() => playing.current) }
  $effect(() => {
    imperativePlaying.current = playing.current
  })

  const inPoint = $derived(inFrame)
  const outPoint = $derived(outFrame)

  $effect(() => {
    clock.setInPoint(inPoint)
  })

  $effect(() => {
    clock.setOutPoint(outPoint)
  })

  const setPlaybackRate = (rate: number) => {
    clock.playbackRate = rate
  }

  setBridgedTimelinePlaybackContext({
    get playing() {
      return playing.current
    },
    get playbackRate() {
      return playbackRate.current
    },
    imperativePlaying,
    setPlaybackRate,
  })

  setBridgedTimelineBoundsContext({
    rootId: 'player-comp',
    get inFrame() {
      return inFrame
    },
    get outFrame() {
      return outFrame
    },
  })

  const setFrame: SetTimelineContextValue['setFrame'] = (action) => {
    if (typeof action === 'function') {
      const currentState = { 'player-comp': clock.currentFrame }
      const newState = action(currentState)
      const newFrame = newState['player-comp']
      if (newFrame !== undefined && newFrame !== clock.currentFrame) {
        clock.seekToFrame(newFrame)
      }
    } else {
      const newFrame = action['player-comp']
      if (newFrame !== undefined && newFrame !== clock.currentFrame) {
        clock.seekToFrame(newFrame)
      }
    }
  }

  const setPlaying: SetTimelineContextValue['setPlaying'] = (action) => {
    const newPlaying = typeof action === 'function' ? action(clock.isPlaying) : action
    if (newPlaying && !clock.isPlaying) {
      clock.play()
    } else if (!newPlaying && clock.isPlaying) {
      clock.pause()
    }
  }

  setBridgedSetTimelineContext({ setFrame, setPlaying })
  setBridgedTimelineFrameContext(frame)
</script>

{@render children()}
